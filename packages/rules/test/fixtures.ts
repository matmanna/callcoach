import { readFileSync } from "node:fs";
import {
  CueRulesFile,
  DonorFile,
  FactSheetFile,
  PhraseRulesFile,
  PlantedFile,
  RubricFile,
  TranscriptFixture,
} from "@sc/shared";

const dataDir = new URL("../../../data/", import.meta.url);
export const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, dataDir), "utf8"));

export const donor = DonorFile.parse(readJson("donor.json"));
export const facts = FactSheetFile.parse(readJson("fact-sheet.json")).facts;
export const cueRules = CueRulesFile.parse(readJson("cue-rules.json")).rules;
export const phraseRules = PhraseRulesFile.parse(readJson("phrase-rules.json")).rules;
export const rubric = RubricFile.parse(readJson("rubric.json")).items;
export const transcript = TranscriptFixture.parse(readJson("transcript.json"));
export const planted = PlantedFile.parse(readJson("planted.json")).values;
