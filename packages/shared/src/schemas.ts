import { z } from "zod";
import { CueType, FlagLabel, PlaceholderType, Tag } from "./enums.ts";

export const Speaker = z.enum(["donor", "volunteer"]);
export type Speaker = z.infer<typeof Speaker>;

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

/** Client memory and fixtures only. Never persisted or sent. */
export const RawTurn = z.object({
  id: z.string().min(1),
  speaker: Speaker,
  raw: z.string(),
  t: z.number().int().nonnegative(),
});
export type RawTurn = z.infer<typeof RawTurn>;

/** Offsets into the scrubbed string. Carries no original text. */
export const RedactionSpan = z.strictObject({
  type: PlaceholderType,
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type RedactionSpan = z.infer<typeof RedactionSpan>;

/** Deliberately has no `raw` field; strict so one cannot sneak in. */
export const Turn = z.strictObject({
  id: z.string().min(1),
  speaker: Speaker,
  scrubbed: z.string(),
  redactions: z.array(RedactionSpan),
  t: z.number().int().nonnegative(),
});
export type Turn = z.infer<typeof Turn>;

export const Donor = z.object({
  id: z.string().min(1),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  spouse_name: z.string().min(1).optional(),
  employer: z.string().min(1).optional(),
  town: z.string().min(1).optional(),
  campaign: z.string().min(1),
  gift_band: z.string().min(1),
  past_gift_count: z.number().int().nonnegative(),
  last_gift_band: z.string().min(1),
  /** Donor-stated contact limits. */
  limits: z.array(z.string().min(1)),
});
export type Donor = z.infer<typeof Donor>;

export const Fact = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  source: z.string().min(1),
  verified_on: isoDate,
});
export type Fact = z.infer<typeof Fact>;

export const CueRule = z
  .object({
    id: z.string().min(1),
    type: CueType,
    priority: z.number().int().min(1).max(4),
    triggers: z.array(z.string().min(1).refine((s) => s === s.toLowerCase(), "trigger must be lowercase")).min(1),
    card_text: z.string().min(1).optional(),
    fact_id: z.string().min(1).optional(),
    tag: Tag.optional(),
    cooldown_s: z.number().nonnegative().default(60),
    enabled: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    if (r.type === "fact") {
      if (!r.fact_id) ctx.addIssue({ code: "custom", path: ["fact_id"], message: "fact rule requires fact_id" });
      if (r.card_text !== undefined)
        ctx.addIssue({ code: "custom", path: ["card_text"], message: "fact rule must not have card_text" });
    } else if (!r.card_text) {
      ctx.addIssue({ code: "custom", path: ["card_text"], message: `${r.type} rule requires card_text` });
    }
  });
export type CueRule = z.infer<typeof CueRule>;
export type CueRuleInput = z.input<typeof CueRule>;

export const PhraseRule = z.object({
  id: z.string().min(1),
  /** Regex sources, compiled case-insensitive. */
  patterns: z
    .array(
      z.string().refine((s) => {
        try {
          new RegExp(s, "i");
          return true;
        } catch {
          return false;
        }
      }, "invalid regex"),
    )
    .min(1),
  placeholder: z.string().min(1),
  type: z.literal("FAMILY"),
  tag: Tag.optional(),
});
export type PhraseRule = z.infer<typeof PhraseRule>;

export const RubricItem = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  supporting_tags: z.array(Tag),
  conditional_on_tag: Tag.optional(),
});
export type RubricItem = z.infer<typeof RubricItem>;

export const RedactionCounts = z.partialRecord(PlaceholderType, z.number().int().nonnegative());
export type RedactionCounts = z.infer<typeof RedactionCounts>;

export const ApprovePayload = z.strictObject({
  idempotency_key: z.string().min(1),
  donor_ref: z.string().min(1),
  consent_ts: isoDateTime,
  summary: z.string().max(400),
  tags: z.array(Tag),
  redaction_counts: RedactionCounts,
  client_version: z.string().min(1),
});
export type ApprovePayload = z.infer<typeof ApprovePayload>;

export const FlagResult = z.object({
  flags: z.array(z.object({ label: FlagLabel, reason: z.string().max(160) })),
});
export type FlagResult = z.infer<typeof FlagResult>;

// File schemas, used to validate data/*.json at load.
export const FactSheetFile = z.object({ facts: z.array(Fact).min(1) });
export type FactSheetFile = z.infer<typeof FactSheetFile>;
export const CueRulesFile = z.object({ rules: z.array(CueRule).min(1) });
export type CueRulesFile = z.infer<typeof CueRulesFile>;
export const PhraseRulesFile = z.object({ rules: z.array(PhraseRule) });
export type PhraseRulesFile = z.infer<typeof PhraseRulesFile>;
export const RubricFile = z.object({ items: z.array(RubricItem).min(1) });
export type RubricFile = z.infer<typeof RubricFile>;
export const DonorFile = Donor;
export type DonorFile = z.infer<typeof DonorFile>;
export const TranscriptFixture = z.object({
  call_id: z.string().min(1),
  donor_id: z.string().min(1),
  /** Synthetic volunteer name, so fixtures can exercise volunteer-name redaction. */
  volunteer_name: z.string().min(1).optional(),
  turns: z.array(RawTurn).min(1),
});
export type TranscriptFixture = z.infer<typeof TranscriptFixture>;
export const PlantedFile = z.object({
  values: z.array(z.object({ value: z.string().min(1), type: PlaceholderType })).min(1),
});
export type PlantedFile = z.infer<typeof PlantedFile>;
