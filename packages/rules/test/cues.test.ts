import type { CueRule, Fact, Turn } from "@sc/shared";
import { CueRule as CueRuleSchema } from "@sc/shared";
import { describe, expect, it } from "vitest";
import { initialCueState, selectCue, validateRules } from "../src/cues.ts";
import { buildKnownIdentifiers, redactTurn } from "../src/redact.ts";
import { collectTags } from "../src/tags.ts";
import { cueRules, donor, facts, phraseRules, transcript } from "./fixtures.ts";

const turn = (scrubbed: string, t = 0, speaker: Turn["speaker"] = "donor"): Turn => ({ id: `t${t}`, speaker, scrubbed, redactions: [], t });

describe("selectCue", () => {
  it("ignores volunteer turns", () => {
    const r = selectCue(turn("I miss him so much", 0, "volunteer"), cueRules, facts, initialCueState());
    expect(r.cue).toBeNull();
    expect(r.dncCandidate).toBe(false);
  });

  it("returns null when nothing matches", () => {
    expect(selectCue(turn("How nice to hear from you."), cueRules, facts, initialCueState()).cue).toBeNull();
  });

  it("matches on word boundaries, case-insensitively", () => {
    expect(selectCue(turn("Please EMAIL ME the details"), cueRules, facts, initialCueState()).cue?.rule_id).toBe("EMAIL_PREF");
    expect(selectCue(turn("Please emailme the details"), cueRules, facts, initialCueState()).cue).toBeNull();
  });

  it("picks the lowest priority number: loss beats program question", () => {
    const r = selectCue(turn("[FAMILY: deceased, recent]. What does the youth program do?"), cueRules, facts, initialCueState());
    expect(r.cue?.rule_id).toBe("DISTRESS_LOSS");
    expect(r.cue?.type).toBe("distress");
    expect(r.matchedRuleIds).toEqual(["DISTRESS_LOSS", "PROGRAM_Q"]);
  });

  it("breaks priority ties by file order", () => {
    const rules: CueRule[] = [
      CueRuleSchema.parse({ id: "A", type: "tip", priority: 4, triggers: ["hello"], card_text: "a" }),
      CueRuleSchema.parse({ id: "B", type: "tip", priority: 4, triggers: ["hello"], card_text: "b" }),
    ];
    expect(selectCue(turn("hello"), rules, facts, initialCueState()).cue?.rule_id).toBe("A");
  });

  it("respects cooldown using turn.t", () => {
    const s1 = selectCue(turn("I miss her", 10_000), cueRules, facts, initialCueState());
    expect(s1.cue?.rule_id).toBe("DISTRESS_LOSS");
    expect(selectCue(turn("I miss her", 69_999), cueRules, facts, s1.state).cue).toBeNull();
    expect(selectCue(turn("I miss her", 70_000), cueRules, facts, s1.state).cue?.rule_id).toBe("DISTRESS_LOSS");
  });

  it("falls through to the next match while the higher rule cools down", () => {
    const s1 = selectCue(turn("I miss him", 0), cueRules, facts, initialCueState());
    const s2 = selectCue(turn("I miss him. Can you email me?", 5_000), cueRules, facts, s1.state);
    expect(s2.cue?.rule_id).toBe("EMAIL_PREF");
  });

  it("skips disabled rules", () => {
    const rules = cueRules.map((r) => (r.id === "DISTRESS_LOSS" ? { ...r, enabled: false } : r));
    expect(selectCue(turn("I miss him"), rules, facts, initialCueState()).cue).toBeNull();
  });

  it("resolves fact cards from the fact sheet and shows a fact only once per call", () => {
    const s1 = selectCue(turn("What does the youth program do?", 0), cueRules, facts, initialCueState());
    const fact = facts.find((f) => f.id === "f-mentoring")!;
    expect(s1.cue).toEqual({
      rule_id: "PROGRAM_Q",
      type: "fact",
      tag: "PROGRAM_QUESTION",
      card_text: fact.text,
      source: fact.source,
      verified_on: fact.verified_on,
    });
    expect(s1.state.shownFactIds).toEqual(["f-mentoring"]);
    // Well past cooldown, still suppressed.
    expect(selectCue(turn("Where does the money go?", 600_000), cueRules, facts, s1.state).cue).toBeNull();
  });

  it("throws when a chosen fact rule's fact is missing", () => {
    expect(() => selectCue(turn("what does it do"), cueRules, [] as Fact[], initialCueState())).toThrow(/missing fact/);
  });

  it("sets dncCandidate on stop-contact", () => {
    const r = selectCue(turn("Please stop calling me."), cueRules, facts, initialCueState());
    expect(r.cue?.type).toBe("stop_contact");
    expect(r.dncCandidate).toBe(true);
    expect(selectCue(turn("email me"), cueRules, facts, initialCueState()).dncCandidate).toBe(false);
  });

  it("does not mutate state", () => {
    const state = Object.freeze({ lastFiredMs: Object.freeze({}), shownFactIds: Object.freeze([]) as readonly string[] });
    const r = selectCue(turn("What does the youth program do?", 1_000), cueRules, facts, state);
    expect(state).toEqual({ lastFiredMs: {}, shownFactIds: [] });
    expect(r.state).not.toBe(state);
    expect(r.state.lastFiredMs).toEqual({ PROGRAM_Q: 1_000 });
  });

  it("runs over the scripted call: expected cues in order", () => {
    const known = buildKnownIdentifiers(donor, transcript.volunteer_name ?? "");
    let state = initialCueState();
    const fired: string[] = [];
    const scrubbedTurns = transcript.turns.map((t) => redactTurn(t, { known, phraseRules }));
    for (const t of scrubbedTurns) {
      const r = selectCue(t, cueRules, facts, state);
      state = r.state;
      if (r.cue) fired.push(r.cue.rule_id);
    }
    expect(fired).toEqual(["DISTRESS_LOSS", "PROGRAM_Q", "EMAIL_PREF"]);
    expect(collectTags(fired, scrubbedTurns, cueRules, phraseRules)).toEqual([
      "EMAIL_PREFERRED",
      "FAMILY_DECEASED_RECENT",
      "PROGRAM_QUESTION",
    ]);
  });
});

describe("validateRules", () => {
  const base = cueRules;
  it("throws on a missing fact", () => {
    expect(() => validateRules(base, facts.filter((f) => f.id !== "f-mentoring"))).toThrow(/missing fact/);
  });
  it("throws on a non-lowercase trigger", () => {
    const bad = base.map((r, i) => (i === 0 ? { ...r, triggers: ["Passed Away"] } : r));
    expect(() => validateRules(bad, facts)).toThrow(/lowercase/);
  });
  it("throws on a duplicate id", () => {
    expect(() => validateRules([...base, base[0]!], facts)).toThrow(/duplicate/);
  });
});

describe("collectTags", () => {
  it("returns unique sorted tags from fired rules and FAMILY spans", () => {
    const scrubbed = "[FAMILY: deceased, recent] in spring";
    const spans = [{ scrubbed, redactions: [{ type: "FAMILY" as const, start: 0, end: 26 }] }];
    expect(collectTags(["EMAIL_PREF", "DISTRESS_LOSS", "EMAIL_PREF"], spans, cueRules, phraseRules)).toEqual([
      "EMAIL_PREFERRED",
      "FAMILY_DECEASED_RECENT",
    ]);
    expect(collectTags([], [], cueRules, phraseRules)).toEqual([]);
  });
});
