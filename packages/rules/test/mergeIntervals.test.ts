import { describe, expect, it } from "vitest";
import { redactWithExtra } from "../src/mergeIntervals.ts";
import { buildKnownIdentifiers, redactTurn } from "../src/redact.ts";
import { explainRedaction } from "../src/redactExplain.ts";
import { donor, phraseRules, transcript } from "./fixtures.ts";
import { excerpts } from "./labFixtures.ts";

const cases = [
  { id: "transcript", turns: transcript.turns, ctx: { known: buildKnownIdentifiers(donor, transcript.volunteer_name ?? ""), phraseRules } },
  ...excerpts.map((x) => ({ id: x.id, turns: x.turns, ctx: { known: buildKnownIdentifiers(x.donor, x.volunteer_name), phraseRules } })),
];
const ctx = cases[0]!.ctx;
const raw = (text: string) => ({ id: "a", speaker: "donor" as const, raw: text, t: 0 });

describe("redactWithExtra", () => {
  it.each(cases)("$id: with no extra equals redactTurn", ({ turns, ctx }) => {
    for (const t of turns) expect(redactWithExtra(t, ctx, [])).toEqual(redactTurn(t, ctx));
  });

  it("adds an NER-only span (name not in the donor record)", () => {
    const text = "My nephew Kofi Mensah came along.";
    const s = text.indexOf("Kofi Mensah");
    const out = redactWithExtra(raw(text), ctx, [{ start: s, end: s + "Kofi Mensah".length, type: "NAME" }]);
    expect(out.scrubbed).toBe("My nephew [NAME] came along.");
    expect(out.redactions).toEqual([{ type: "NAME", start: 10, end: 16 }]);
  });

  it("longer NER span overlapping a layer-1 match wins, with correct offsets", () => {
    // Known identifier "Millbrook" (TOWN, 9 chars) inside NER ORG "Millbrook Savings Bank" (22 chars).
    const text = "I bank at Millbrook Savings Bank downtown.";
    const s = text.indexOf("Millbrook Savings Bank");
    const out = redactWithExtra(raw(text), ctx, [{ start: s, end: s + 22, type: "EMPLOYER" }]);
    expect(out.scrubbed).toBe("I bank at [EMPLOYER] downtown.");
    expect(out.redactions).toEqual([{ type: "EMPLOYER", start: 10, end: 20 }]);
  });

  it("shorter NER span inside a layer-1 match loses; equal length goes to the earlier layer", () => {
    const text = "This is Rosalind Featherstone.";
    const s = text.indexOf("Featherstone");
    const shorter = redactWithExtra(raw(text), ctx, [{ start: s, end: s + 12, type: "EMPLOYER" }]);
    expect(shorter.scrubbed).toBe("This is [NAME].");
    const t = text.indexOf("Rosalind Featherstone");
    const tie = redactWithExtra(raw(text), ctx, [{ start: t, end: t + 21, type: "TOWN" }]);
    expect(tie.scrubbed).toBe("This is [NAME].");
  });

  it("partial overlap merges to the union", () => {
    const text = "Rosalind Featherstone Jr arrived";
    const s = text.indexOf("Featherstone Jr");
    const out = redactWithExtra(raw(text), ctx, [{ start: s, end: s + 15, type: "NAME" }]);
    expect(out.scrubbed).toBe("[NAME] arrived");
  });

  it("ignores out-of-range extras and shows them as layer 'extra' in explain", () => {
    expect(redactWithExtra(raw("hi"), ctx, [{ start: 0, end: 99, type: "NAME" }]).scrubbed).toBe("hi");
    const e = explainRedaction(raw("Kofi said hi"), ctx, undefined, [{ start: 0, end: 4, type: "NAME" }]);
    expect(e.merged.map((m) => m.layer)).toEqual(["extra"]);
    expect(e.scrubbed).toBe("[NAME] said hi");
  });
});
