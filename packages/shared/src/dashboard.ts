/**
 * Coordinator dashboard (Prompt K3): versioned dossier limits, versioned fact items and rubrics,
 * knowledge entries, handoff packets, patterns. No field holds call text, by design.
 */
import { z } from "zod";
import { Tag } from "./enums.ts";
import { RubricWeight } from "./orgProfile.ts";
import { Timezone } from "./identity.ts";

const id = z.string().min(1);

/** Any count under this is suppressed server-side. The UI never receives the number. */
export const MIN_CELL = 5;
export const RED_LABELS = ["DISTRESS", "STOP_CONTACT", "OFF_SCRIPT_CLAIM"] as const;
export const DONOR_SEGMENTS = ["first_time", "lapsed", "recent"] as const;
export type DonorSegment = (typeof DONOR_SEGMENTS)[number];

/** Sort keys the volunteers endpoint accepts. Performance-style keys are rejected. */
export const VOLUNTEER_SORT_KEYS = ["name", "team", "joined", "last_activity"] as const;

// ---------- dossier ----------
export const LimitKind = z.enum(["limit", "preference"]);
export const LimitStatus = z.enum(["active", "superseded", "removed"]);

/** One version of a stated limit or preference. Old versions are kept with their dates. */
export const DonorLimitDoc = z.object({
  _id: id,
  org_id: id,
  donor_id: id,
  /** Stable id for the limit across versions. */
  key: id,
  kind: LimitKind,
  version: z.number().int().positive(),
  value: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(200),
  /** Date the donor stated it. */
  stated_on: z.iso.date(),
  status: LimitStatus,
  created_by: id,
  created_at: z.date(),
});
export type DonorLimitDoc = z.infer<typeof DonorLimitDoc>;

export const LimitChange = z.strictObject({
  action: z.enum(["add", "edit", "remove"]),
  key: id.optional(),
  value: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().min(1, "source is required").max(200),
  stated_on: z.iso.date("stated_on must be YYYY-MM-DD"),
});
export const PreferenceAdd = z.strictObject({
  value: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1, "source is required").max(200),
  stated_on: z.iso.date("stated_on must be YYYY-MM-DD"),
});
export const DeleteDossier = z.strictObject({ confirm_external_id: z.string().min(1).max(64) });

// ---------- fact items and rubrics ----------
export const FactVersionStatus = z.enum(["draft", "approved", "superseded", "rejected"]);
export const FACT_TEXT_MAX = 240;

export const FactItemVersionDoc = z.object({
  _id: id,
  org_id: id,
  sheet_id: id,
  item_id: id,
  version: z.number().int().positive(),
  text: z.string().trim().min(1).max(FACT_TEXT_MAX),
  source: z.string().trim().min(1).max(200),
  verified_on: z.iso.date(),
  owner_user_id: id,
  status: FactVersionStatus,
  created_by: id,
  created_at: z.date(),
  approved_by: id.nullable(),
  approved_at: z.date().nullable(),
  self_approved: z.boolean(),
  note: z.string().max(300).nullable(),
});
export type FactItemVersionDoc = z.infer<typeof FactItemVersionDoc>;

/** Saving a draft needs every field. Zod messages name the missing field, never a value. */
export const FactVersionCreate = z.strictObject({
  item_id: id.optional(),
  text: z.string().trim().min(1, "text is required").max(FACT_TEXT_MAX, `text is at most ${FACT_TEXT_MAX} characters`),
  source: z.string().trim().min(1, "source is required").max(200),
  verified_on: z.iso.date("verified_on must be YYYY-MM-DD"),
  owner_user_id: id,
});
export const FactReverify = z.strictObject({
  source: z.string().trim().min(1, "source is required").max(200),
  verified_on: z.iso.date("verified_on must be YYYY-MM-DD"),
});
export const FactApprove = z.strictObject({ note: z.string().trim().max(300).optional() });

export const RubricUpdate = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id,
        text: z.string().trim().min(1).max(300),
        supporting_tags: z.array(Tag),
        conditional_on_tag: Tag.nullable().optional(),
        weight: RubricWeight.optional(),
      }),
    )
    .min(1),
  note: z.string().trim().max(300).optional(),
});

export const RubricVersionDoc = z.object({
  _id: id,
  org_id: id,
  rubric_id: id,
  version: z.number().int().positive(),
  items: z.array(z.object({ id, text: z.string(), supporting_tags: z.array(Tag), conditional_on_tag: Tag.nullable(), weight: RubricWeight.optional() })),
  note: z.string().nullable(),
  created_by: id,
  created_at: z.date(),
});
export type RubricVersionDoc = z.infer<typeof RubricVersionDoc>;

// ---------- knowledge entries and handoff packets ----------
export const KnowledgeType = z.enum(["process", "campaign", "guidance", "handoff"]);
export const KnowledgeStatus = z.enum(["draft", "published", "retired"]);

export const KnowledgeEntryDoc = z.object({
  _id: id,
  org_id: id,
  team_id: id.nullable(),
  type: KnowledgeType,
  title: z.string().max(160),
  body: z.string().max(4000),
  status: KnowledgeStatus,
  version: z.number().int().positive(),
  created_by: id,
  created_at: z.date(),
  updated_at: z.date(),
  published_by: id.nullable(),
  published_at: z.date().nullable(),
});
export type KnowledgeEntryDoc = z.infer<typeof KnowledgeEntryDoc>;

export const KnowledgeCreate = z.strictObject({
  type: KnowledgeType,
  title: z.string().trim().min(1, "title is required").max(160),
  body: z.string().trim().min(1, "body is required").max(4000),
  team_id: id.nullable().optional(),
});
export const KnowledgeUpdate = z.strictObject({
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
});

export const HandoffItemKind = z.enum(["follow_up", "entry"]);
export const HandoffPacketDoc = z.object({
  _id: id,
  org_id: id,
  team_id: id,
  from_user_id: id,
  to_user_id: id,
  note: z.string().max(500),
  items: z.array(z.object({ id, kind: HandoffItemKind, ref_id: id, label: z.string().max(200), acknowledged_at: z.date().nullable() })),
  status: z.enum(["open", "acknowledged"]),
  created_at: z.date(),
  acknowledged_at: z.date().nullable(),
});
export type HandoffPacketDoc = z.infer<typeof HandoffPacketDoc>;

export const HandoffCreate = z.strictObject({
  team_id: id,
  to_user_id: id,
  note: z.string().trim().max(500).default(""),
  follow_up_ids: z.array(id).max(200).default([]),
  entry_ids: z.array(id).max(200).default([]),
});

// ---------- patterns ----------
export const PatternDoc = z.object({
  _id: id,
  org_id: id,
  title: z.string().max(160),
  description: z.string().max(500),
  segment: z.string().max(120),
  denominator: z.number().int().nonnegative(),
  date_from: z.iso.date(),
  date_to: z.iso.date(),
  status: z.enum(["proposed", "approved", "retired"]),
  decided_by: id.nullable(),
  decided_at: z.date().nullable(),
  created_at: z.date(),
});
export type PatternDoc = z.infer<typeof PatternDoc>;

// ---------- queue ----------
export const QueueDecision = z.strictObject({
  action: z.enum(["approve", "override", "resolve"]),
  note: z.string().trim().max(300).optional(),
});
export const QueueBatchResolve = z.strictObject({ ids: z.array(id).min(1).max(100), note: z.string().trim().max(300).optional() });
export const LimitDecision = z.strictObject({ action: z.enum(["approve", "reject"]), note: z.string().trim().max(300).optional() });
export const CancelFollowUp = z.strictObject({ note: z.string().trim().min(1, "a note is required").max(300) });

export const InsightRange = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
export const TeamTimezone = Timezone;
