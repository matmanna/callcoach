import { describe, expect, it } from "vitest";
import { explainRedaction, redactWithLayers } from "../src/redactExplain.ts";
import { buildKnownIdentifiers, redactTurn } from "../src/redact.ts";
import { donor, phraseRules, transcript } from "./fixtures.ts";
import { excerpts } from "./labFixtures.ts";

const ALL = { known: true, regex: true, phrase: true };
const cases = [
  { id: "transcript", turns: transcript.turns, ctx: { known: buildKnownIdentifiers(donor, transcript.volunteer_name ?? ""), phraseRules } },
  ...excerpts.map((x) => ({ id: x.id, turns: x.turns, ctx: { known: buildKnownIdentifiers(x.donor, x.volunteer_name), phraseRules } })),
];

describe("explainRedaction / redactWithLayers equivalence", () => {
  it.each(cases)("$id: matches redactTurn on every turn", ({ turns, ctx }) => {
    for (const t of turns) {
      const expected = redactTurn(t, ctx);
      const explained = explainRedaction(t, ctx);
      expect(explained.scrubbed).toBe(expected.scrubbed);
      expect(explained.redactions).toEqual(expected.redactions);
      expect(redactWithLayers(t, ctx, ALL)).toEqual(expected);
    }
  });
});

describe("explainRedaction", () => {
  const ctx = cases[0]!.ctx;
  it("reports raw-text intervals per layer", () => {
    const raw = { id: "a", speaker: "donor" as const, raw: "Rosalind, call (814) 555-0142. My husband passed away.", t: 0 };
    const e = explainRedaction(raw, ctx);
    expect(e.layers.known.map((i) => raw.raw.slice(i.start, i.end))).toEqual(["Rosalind"]);
    expect(e.layers.regex.map((i) => [i.type, raw.raw.slice(i.start, i.end)])).toEqual([["PHONE", "(814) 555-0142"]]);
    expect(e.layers.phrase.map((i) => i.layer)).toEqual(["phrase"]);
    expect(e.merged.map((i) => i.layer)).toEqual(["known", "regex", "phrase"]);
  });

  it("honours a layer subset", () => {
    const raw = { id: "a", speaker: "donor" as const, raw: "Rosalind at 814-555-0142", t: 0 };
    expect(redactWithLayers(raw, ctx, { known: true, regex: false, phrase: false }).scrubbed).toBe("[NAME] at 814-555-0142");
    expect(redactWithLayers(raw, ctx, { known: false, regex: true, phrase: false }).scrubbed).toBe("Rosalind at [PHONE]");
    expect(explainRedaction(raw, ctx, { known: false, regex: false, phrase: false }).scrubbed).toBe(raw.raw);
  });
});
