import {
  CueRulesFile,
  DonorFile,
  FactSheetFile,
  PhraseRulesFile,
  PlantedFile,
  RubricFile,
  TranscriptFixture,
} from "@sc/shared";
import { describe, expect, it } from "vitest";
import { validateRules } from "../src/cues.ts";
import { cueRules, facts, readJson, transcript } from "./fixtures.ts";

describe("data files", () => {
  const files = [
    ["donor.json", DonorFile],
    ["fact-sheet.json", FactSheetFile],
    ["cue-rules.json", CueRulesFile],
    ["phrase-rules.json", PhraseRulesFile],
    ["rubric.json", RubricFile],
    ["transcript.json", TranscriptFixture],
    ["planted.json", PlantedFile],
  ] as const;

  it.each(files)("%s parses with its schema", (name, schema) => {
    expect(schema.safeParse(readJson(name)).success).toBe(true);
  });

  it("validateRules passes on the real rules and facts", () => {
    expect(() => validateRules(cueRules, facts)).not.toThrow();
  });

  it("required cue rules exist", () => {
    expect(cueRules.map((r) => r.id)).toEqual(expect.arrayContaining(["DISTRESS_LOSS", "STOP_CONTACT", "EMAIL_PREF", "PROGRAM_Q"]));
  });

  it("transcript has 14-18 alternating turns with increasing t", () => {
    const turns = transcript.turns;
    expect(turns.length).toBeGreaterThanOrEqual(14);
    expect(turns.length).toBeLessThanOrEqual(18);
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i]!.speaker).not.toBe(turns[i - 1]!.speaker);
      expect(turns[i]!.t).toBeGreaterThan(turns[i - 1]!.t);
    }
  });
});
