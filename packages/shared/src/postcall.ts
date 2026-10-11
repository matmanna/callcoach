/**
 * Pre-call and post-call platform (Prompt P2): call logs, flags, pending limits, follow-ups,
 * warmth. No field holds a note, transcript, or audio, by design.
 */
import { z } from "zod";
import { FlagLabel } from "./enums.ts";

const id = z.string().min(1);

export const Outcome = z.enum(["reached", "voicemail", "no_answer", "declined", "rescheduled"]);
export type Outcome = z.infer<typeof Outcome>;

export const Preference = z.enum(["none", "email_preferred", "stop_calls", "call_later"]);
export type Preference = z.infer<typeof Preference>;

/** Flags a log may carry. PLANNED_GIVING and ENGAGE_MORE are not allowed here. */
export const LogFlag = FlagLabel.extract(["DISTRESS", "STOP_CONTACT", "OFF_SCRIPT_CLAIM"]);
export type LogFlag = z.infer<typeof LogFlag>;

/** Fixed reason codes; the draft prefers these over free text. */
export const REASON_CODES = [
  "Thanked for the gift",
  "Prefers email contact",
  "Asked not to be called again",
  "Asked for a call back later",
  "Declined to talk",
  "Left a voicemail",
  "No answer",
  "Asked about the program",
  "Shared a recent loss",
] as const;

export const FollowUpDraft = z.strictObject({
  needed: z.boolean(),
  action: z.string().trim().max(120),
  due_date: z.iso.date().nullable(),
});

/** The structured log fields. Same shape for the draft and the approved entry. */
export const LogFields = z.strictObject({
  outcome: Outcome,
  donor_stated_reason: z.string().trim().max(160),
  preference: Preference,
  follow_up: FollowUpDraft,
  flags: z.array(LogFlag).max(3),
}).superRefine((value, ctx) => {
  if (value.follow_up.needed && !value.follow_up.action) ctx.addIssue({ code: "custom", path: ["follow_up", "action"], message: "action is required when follow-up is needed" });
});
export type LogFields = z.infer<typeof LogFields>;

export const ModelDraftStatus = z.enum(["ok", "unavailable", "disabled"]);

export const CallLogDoc = z.object({
  _id: id,
  org_id: id,
  team_id: id,
  donor_id: id,
  caller_id: id,
  status: z.enum(["draft", "approved"]),
  draft: LogFields,
  model_draft: ModelDraftStatus,
  /** Placeholder counts from the scrub (types and counts only). */
  redaction_counts: z.record(z.string(), z.number().int().nonnegative()),
  approved: LogFields.nullable(),
  approved_at: z.date().nullable(),
  idempotency_key: z.string().nullable(),
  corrects_log_id: id.nullable(),
  created_at: z.date(),
});
export type CallLogDoc = z.infer<typeof CallLogDoc>;

export const DraftRequest = z.strictObject({
  /** Already scrubbed in the browser; the API scrubs again and never stores it. */
  note: z.string().min(1).max(600),
  corrects_log_id: id.optional(),
});

/** Approve payload for logs. Strict: unknown keys (including any note) are rejected. */
export const ApproveLogPayload = z.strictObject({
  idempotency_key: z.string().min(8).max(100),
  fields: LogFields,
  client_version: z.string().min(1).max(40),
});
export type ApproveLogPayload = z.infer<typeof ApproveLogPayload>;

export const QueueFlagStatus = z.enum(["proposed", "approved", "overridden", "resolved"]);

export const CallFlagDoc = z.object({
  _id: id,
  org_id: id,
  team_id: id,
  donor_id: id,
  log_id: id,
  label: LogFlag,
  reason: z.string().max(160),
  status: QueueFlagStatus,
  created_at: z.date(),
  decided_by: id.nullable(),
  decided_at: z.date().nullable(),
  decision_note: z.string().max(300).nullable(),
});
export type CallFlagDoc = z.infer<typeof CallFlagDoc>;

export const PendingLimitDoc = z.object({
  _id: id,
  org_id: id,
  team_id: id,
  donor_id: id,
  log_id: id,
  limit: z.string().max(200),
  status: z.enum(["pending", "approved", "rejected"]),
  created_at: z.date(),
  decided_by: id.nullable(),
  decided_at: z.date().nullable(),
});
export type PendingLimitDoc = z.infer<typeof PendingLimitDoc>;

export const FollowUpStatus = z.enum(["open", "done", "handed_off", "cancelled"]);
export type FollowUpStatus = z.infer<typeof FollowUpStatus>;

export const FollowUpDoc = z.object({
  _id: id,
  org_id: id,
  donor_id: id,
  team_id: id,
  owner_user_id: id,
  action: z.string().max(120),
  due_date: z.iso.date().nullable(),
  status: FollowUpStatus,
  created_from_log_id: id,
  created_at: z.date(),
  closed_at: z.date().nullable(),
  /** Idempotency keys already applied to this follow-up (complete, handoff, cancel). */
  action_keys: z.array(z.string()),
  action_results: z.array(z.object({ key: z.string(), actor_user_id: id, status: FollowUpStatus, owner_user_id: id, closed_at: z.date().nullable() })).optional(),
  last_note: z.string().max(300).nullable(),
});
export type FollowUpDoc = z.infer<typeof FollowUpDoc>;

export const FollowUpAction = z.strictObject({ idempotency_key: z.string().min(8).max(100), note: z.string().trim().max(300).optional() });
export const HandoffBody = z.strictObject({ idempotency_key: z.string().min(8).max(100), to_user_id: id, note: z.string().trim().min(1, "a handoff note is required").max(300) });
export const DecisionBody = z.strictObject({ note: z.string().trim().max(300).optional() });

export const WarmthScore = z.number().int().min(1).max(5);

/** One-line anchors shared by the caller's rating and the model crosscheck. */
export const WARMTH_ANCHORS: Readonly<Record<1 | 2 | 3 | 4 | 5, string>> = {
  1: "Cold: short or strained; the donor wanted off the call.",
  2: "Cool: polite but distant.",
  3: "Neutral: friendly enough, little connection.",
  4: "Warm: easy conversation; the donor engaged.",
  5: "Very warm: real connection; the donor shared and thanked.",
};

export const WarmthDoc = z.object({
  _id: id,
  org_id: id,
  team_id: id,
  call_id: id,
  caller_id: id,
  volunteer_score: WarmthScore,
  llm_score: WarmthScore.nullable(),
  llm_reason: z.string().max(160).nullable(),
  llm_status: z.enum(["ok", "unavailable", "disabled"]),
  idempotency_key: z.string(),
  created_at: z.date(),
});
export type WarmthDoc = z.infer<typeof WarmthDoc>;

export const WarmthSubmit = z.strictObject({ idempotency_key: z.string().min(8).max(100), score: WarmthScore });

/** Gap of 2 or more prompts a conversation. Scores are never averaged. */
export const WARMTH_DISCUSS_GAP = 2;
export const WARMTH_DISCUSS_PROMPT = "Caller and model read this differently. What did you see?";
export const MIN_CELL_SIZE = 5;

/** Rule data for the deterministic draft (data/log-rules.json). Lowercase trigger phrases. */
const lower = z.string().min(1).refine((s) => s === s.toLowerCase(), "trigger must be lowercase");
export const LogRulesFile = z.object({
  outcome: z.array(z.object({ outcome: Outcome, triggers: z.array(lower).min(1) })),
  preference: z.array(z.object({ preference: Preference.exclude(["none"]), triggers: z.array(lower).min(1) })),
  follow_up: z.array(z.object({ triggers: z.array(lower).min(1), action: z.string().max(120) })),
  flag: z.array(z.object({ label: LogFlag, triggers: z.array(lower).min(1) })).optional(),
});
export type LogRulesFile = z.infer<typeof LogRulesFile>;
