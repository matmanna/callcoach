import type { Donor, PhraseRule, RawTurn } from "@sc/shared";
import { Turn } from "@sc/shared";
import { describe, expect, it } from "vitest";
import { buildKnownIdentifiers, redactTurn, redactionCounts } from "../src/redact.ts";
import { phraseRules } from "./fixtures.ts";

const donor: Donor = {
  id: "d-test",
  first_name: "Ada",
  last_name: "Quillfeather",
  spouse_name: "Bertram",
  employer: "Northwind Mills",
  town: "Ashgrove",
  campaign: "Test",
  gift_band: "$1-$99",
  past_gift_count: 1,
  last_gift_band: "$1-$99",
  limits: [],
};
const known = buildKnownIdentifiers(donor, "Casey Lindqvist");
const ctx = { known, phraseRules };
const raw = (text: string, speaker: RawTurn["speaker"] = "donor"): RawTurn => ({ id: "x", speaker, raw: text, t: 1234 });
const scrub = (text: string) => redactTurn(raw(text), ctx);

describe("buildKnownIdentifiers", () => {
  it("includes names, full name, spouse, employer, town, volunteer; skips <3 chars", () => {
    const values = known.map((k) => k.value);
    expect(values).toEqual(
      expect.arrayContaining(["Quillfeather", "Ada Quillfeather", "Bertram", "Northwind Mills", "Ashgrove", "Casey Lindqvist", "Casey", "Lindqvist"]),
    );
    expect(values).toContain("Ada");
    const short = buildKnownIdentifiers({ ...donor, first_name: "Al" }, "Bo");
    expect(short.map((k) => k.value)).not.toContain("Al");
    expect(short.map((k) => k.value)).not.toContain("Bo");
    expect(short.map((k) => k.value)).toContain("Al Quillfeather");
  });
});

describe("redactTurn", () => {
  it("replaces known identifiers with typed placeholders and correct offsets", () => {
    const out = scrub("Hi Ada, how is Ashgrove? Still at Northwind Mills?");
    expect(out.scrubbed).toBe("Hi [NAME], how is [TOWN]? Still at [EMPLOYER]?");
    for (const span of out.redactions) {
      expect(out.scrubbed.slice(span.start, span.end)).toBe(`[${span.type}]`);
    }
    expect(out.redactions.map((r) => r.type)).toEqual(["NAME", "TOWN", "EMPLOYER"]);
  });

  it("is case-insensitive and respects word boundaries", () => {
    expect(scrub("ASHGROVE and ashgrove").scrubbed).toBe("[TOWN] and [TOWN]");
    expect(scrub("Adams and Adaline are not Ada").scrubbed).toBe("Adams and Adaline are not [NAME]");
  });

  it("handles possessives", () => {
    expect(scrub("That was Bertram's idea, and Quillfeather’s too.").scrubbed).toBe("That was [NAME] idea, and [NAME] too.");
  });

  it("prefers the full name over its parts", () => {
    const out = scrub("This is Ada Quillfeather.");
    expect(out.scrubbed).toBe("This is [NAME].");
    expect(out.redactions).toHaveLength(1);
  });

  it.each([
    ["(814) 555-0142", "PHONE"],
    ["814-555-0142", "PHONE"],
    ["814.555.0142", "PHONE"],
    ["8145550142", "PHONE"],
    ["ada.q+gifts@example.org", "EMAIL"],
    ["12 Elm St", "ADDRESS"],
    ["4400 Old Mill Pond Road", "ADDRESS"],
    ["9 Birch Lane", "ADDRESS"],
    ["03/14/1952", "DOB"],
    ["March 14, 1952", "DOB"],
    ["14 March 1952", "DOB"],
  ])("regex layer: %s -> [%s]", (value, type) => {
    const out = scrub(`call me at ${value} please`);
    expect(out.scrubbed).toBe(`call me at [${type}] please`);
    expect(out.redactions).toEqual([{ type, start: 11, end: 11 + type.length + 2 }]);
  });

  it("does not redact month names without a year or bare short numbers", () => {
    expect(scrub("I gave 2 times in March.").scrubbed).toBe("I gave 2 times in March.");
  });

  it("applies phrase rules with the rule placeholder", () => {
    const out = scrub("My husband passed away in March.");
    expect(out.scrubbed).toBe("[FAMILY: deceased, recent] in March.");
    expect(out.redactions).toEqual([{ type: "FAMILY", start: 0, end: "[FAMILY: deceased, recent]".length }]);
  });

  it("merges overlapping matches into one span; longest wins the type", () => {
    // Spouse name sits inside the phrase match: one FAMILY span, no NAME fragment.
    const out = scrub("my husband Bertram passed away last spring");
    expect(out.scrubbed).toBe("[FAMILY: deceased, recent] last spring");
    expect(out.redactions).toHaveLength(1);
    // Known name inside an email: one EMAIL span.
    const email = scrub("write to ada@ashgrove.example.com");
    expect(email.scrubbed).toBe("write to [EMAIL]");
  });

  it("merges partial overlaps to their union so no fragment survives", () => {
    const rules: PhraseRule[] = [{ id: "P", patterns: ["mills pension"], placeholder: "[FAMILY: x]", type: "FAMILY" }];
    // EMPLOYER "Northwind Mills" (15 chars) overlaps phrase "Mills pension" (13 chars).
    const out = redactTurn(raw("Northwind Mills pension plan"), { known, phraseRules: rules });
    expect(out.scrubbed).toBe("[EMPLOYER] plan");
  });

  it("on equal length the earlier layer wins", () => {
    const rules: PhraseRule[] = [{ id: "P", patterns: ["ashgrove"], placeholder: "[FAMILY: x]", type: "FAMILY" }];
    expect(redactTurn(raw("in Ashgrove"), { known, phraseRules: rules }).scrubbed).toBe("in [TOWN]");
  });

  it("is idempotent and never re-matches placeholders", () => {
    const first = scrub("Ada at 12 Elm St, ada@example.org, (814) 555-0142. My wife died in May.");
    const second = redactTurn({ id: first.id, speaker: first.speaker, raw: first.scrubbed, t: first.t }, ctx);
    expect(second).toEqual(first);
  });

  it("output spans carry no original text and Turn has no raw field", () => {
    const out = scrub("Ada Quillfeather of Ashgrove, 555-123-4567");
    expect(Turn.safeParse(out).success).toBe(true);
    expect(Object.keys(out).sort()).toEqual(["id", "redactions", "scrubbed", "speaker", "t"]);
    for (const span of out.redactions) expect(Object.keys(span).sort()).toEqual(["end", "start", "type"]);
    expect(JSON.stringify(out.redactions)).not.toMatch(/Ada|Quillfeather|Ashgrove|555/);
  });

  it("passes speaker and t through", () => {
    const out = redactTurn({ id: "v1", speaker: "volunteer", raw: "hello", t: 42 }, ctx);
    expect(out).toEqual({ id: "v1", speaker: "volunteer", scrubbed: "hello", redactions: [], t: 42 });
  });
});

describe("redactionCounts", () => {
  it("counts every type, zero-filled", () => {
    const counts = redactionCounts([scrub("Ada in Ashgrove"), scrub("Bertram, 814-555-0142")]);
    expect(counts).toEqual({ NAME: 2, PHONE: 1, EMAIL: 0, ADDRESS: 0, DOB: 0, EMPLOYER: 0, TOWN: 1, FAMILY: 0 });
  });
});
