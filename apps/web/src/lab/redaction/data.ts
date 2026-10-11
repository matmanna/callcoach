/** LAB ONLY. Synthetic fixtures and rule files, validated at load. */
import {
  CueRulesFile,
  Donor,
  FactSheetFile,
  FlagLabel,
  PhraseRulesFile,
  PlantedFile,
  RawTurn,
  DEFAULT_ENABLED_FLAGS,
} from "@sc/shared";
import { z } from "zod";
import cueRulesJson from "../../../../../data/cue-rules.json";
import excerptsJson from "../../../../../data/lab/excerpts.json";
import allowlistJson from "../../../../../data/lab/ner-allowlist.json";
import factSheetJson from "../../../../../data/fact-sheet.json";
import phraseRulesJson from "../../../../../data/phrase-rules.json";

export const LabExcerpt = z.object({
  id: z.string().min(1),
  donor: Donor,
  volunteer_name: z.string().min(1),
  turns: z.array(RawTurn).min(8).max(14),
  planted: PlantedFile.shape.values,
  expected_flags: z.array(FlagLabel.refine((l) => DEFAULT_ENABLED_FLAGS.includes(l), "only default-enabled flags")),
  notes: z.string(),
  review_status: z.enum(["unreviewed", "reviewed"]),
});
export type LabExcerpt = z.infer<typeof LabExcerpt>;

export const LabExcerptFile = z.object({ excerpts: z.array(LabExcerpt).length(10) });
export const NerAllowlistFile = z.object({ terms: z.array(z.string().min(1)) });

export const excerpts: LabExcerpt[] = LabExcerptFile.parse(excerptsJson).excerpts;
export const cueRules = CueRulesFile.parse(cueRulesJson).rules;
export const phraseRules = PhraseRulesFile.parse(phraseRulesJson).rules;
export const facts = FactSheetFile.parse(factSheetJson).facts;
export const nerAllowlist: string[] = NerAllowlistFile.parse(allowlistJson).terms;
