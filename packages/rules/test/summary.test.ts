import { Tag } from "@sc/shared";
import { describe, expect, it } from "vitest";
import { initialCueState, selectCue } from "../src/cues.ts";
import { buildKnownIdentifiers, redactTurn, redactionCounts } from "../src/redact.ts";
import { NEUTRAL_SUMMARY, SUMMARY_MAX_CHARS, TAG_SENTENCES, buildDraftSummary } from "../src/summary.ts";
import { collectTags } from "../src/tags.ts";
import { cueRules, facts, phraseRules } from "./fixtures.ts";
import { excerpts } from "./labFixtures.ts";

const maxCounts = { NAME: 99, PHONE: 99, EMAIL: 99, ADDRESS: 99, DOB: 99, EMPLOYER: 99, TOWN: 99, FAMILY: 99 };

describe("buildDraftSummary", () => {
  it("returns a neutral sentence on empty input", () => {
    expect(buildDraftSummary({ tags: [], counts: {}, cueRuleIds: [] })).toBe(NEUTRAL_SUMMARY);
  });

  it("holds the 400-character cap on maximal input", () => {
    const out = buildDraftSummary({ tags: [...Tag.options], counts: maxCounts, cueRuleIds: ["A", "B", "C"] });
    expect(out.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(out).toMatch(/Next step: coordinator to review/);
  });

  it("is deterministic, independent of tag order", () => {
    const a = buildDraftSummary({ tags: ["EMAIL_PREFERRED", "PROGRAM_QUESTION"], counts: { PHONE: 1, EMAIL: 1, NAME: 2 }, cueRuleIds: ["X"] });
    const b = buildDraftSummary({ tags: ["PROGRAM_QUESTION", "EMAIL_PREFERRED"], counts: { NAME: 2, EMAIL: 1, PHONE: 1 }, cueRuleIds: ["X"] });
    expect(a).toBe(b);
    expect(a).toBe(
      "Donor asked about the program. Donor prefers email contact. Contact details were removed: 1 phone number, 1 email address. " +
        "Other identifiers were removed: 2 names. 1 cue card was shown during the call. Next step: follow up by email, not phone.",
    );
  });

  it("uses only template text: no placeholders or brackets", () => {
    const out = buildDraftSummary({ tags: [...Tag.options], counts: maxCounts, cueRuleIds: ["DISTRESS_LOSS"] });
    expect(out).not.toMatch(/[[\]]/);
    for (const s of Object.values(TAG_SENTENCES)) expect(s).not.toMatch(/[[\]]/);
  });

  it.each(excerpts)("$id: summary contains no planted identifier", (x) => {
    const ctx = { known: buildKnownIdentifiers(x.donor, x.volunteer_name), phraseRules };
    const turns = x.turns.map((t) => redactTurn(t, ctx));
    let state = initialCueState();
    const matched = new Set<string>();
    const shown: string[] = [];
    for (const t of turns) {
      const r = selectCue(t, cueRules, facts, state);
      state = r.state;
      r.matchedRuleIds.forEach((id) => matched.add(id));
      if (r.cue) shown.push(r.cue.rule_id);
    }
    const summary = buildDraftSummary({ tags: collectTags([...matched], turns, cueRules, phraseRules), counts: redactionCounts(turns), cueRuleIds: shown });
    const lower = summary.toLowerCase();
    for (const p of x.planted) expect(lower.includes(p.value.toLowerCase())).toBe(false);
  });
});
