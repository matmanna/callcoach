import { describe, expect, it } from "vitest";
import { PhraseRulesFile, type Donor } from "@sc/shared";
import phraseRaw from "../../../data/phrase-rules.json";
import { noteContext, scrubNote } from "../src/note.ts";

const donor: Donor = { id: "synthetic", first_name: "Rosalind", last_name: "Featherstone", spouse_name: "Walter", employer: "Larkspur Valley Hospital", town: "Millbrook", campaign: "Spring Youth Appeal 2026", gift_band: "$100-$249", past_gift_count: 7, last_gift_band: "$100-$249", limits: [] };

describe("typed note scrub", () => {
  it("replaces known identifiers and phone numbers before drafting", () => {
    const context = noteContext(donor, "Volunteer One", PhraseRulesFile.parse(phraseRaw).rules);
    const result = scrubNote("Rosalind asked for a call to 814-555-0142", context);
    expect(result.text).not.toContain("Rosalind");
    expect(result.text).not.toContain("814-555-0142");
    expect(result.text).toContain("[PHONE]");
  });
});
