import { z } from "zod";

export const FlagLabel = z.enum(["DISTRESS", "STOP_CONTACT", "OFF_SCRIPT_CLAIM", "PLANNED_GIVING", "ENGAGE_MORE"]);
export type FlagLabel = z.infer<typeof FlagLabel>;

/** PLANNED_GIVING and ENGAGE_MORE exist in the enum but are off by default. */
export const DEFAULT_ENABLED_FLAGS: readonly FlagLabel[] = ["DISTRESS", "STOP_CONTACT", "OFF_SCRIPT_CLAIM"];

export const Tag = z.enum([
  "FAMILY_DECEASED_RECENT",
  "HARDSHIP",
  "PROGRAM_QUESTION",
  "EMAIL_PREFERRED",
  "STOP_CONTACT_REQUESTED",
  "FOLLOW_UP_REQUESTED",
  "BEQUEST_MENTION",
  "MONTHLY_GIVING_INTEREST",
]);
export type Tag = z.infer<typeof Tag>;

export const CueType = z.enum(["distress", "stop_contact", "fact", "tip"]);
export type CueType = z.infer<typeof CueType>;

export const CUE_PRIORITY: Readonly<Record<CueType, number>> = { distress: 1, stop_contact: 2, fact: 3, tip: 4 };

export const PlaceholderType = z.enum(["NAME", "PHONE", "EMAIL", "ADDRESS", "DOB", "EMPLOYER", "TOWN", "FAMILY"]);
export type PlaceholderType = z.infer<typeof PlaceholderType>;

export const FlagStatus = z.enum(["proposed", "approved", "overridden", "resolved"]);
export type FlagStatus = z.infer<typeof FlagStatus>;

export const CallStatus = z.enum(["draft", "approved", "flags_pending", "flags_ready", "flags_failed", "resolved"]);
export type CallStatus = z.infer<typeof CallStatus>;

export const RubricStatus = z.enum(["met", "not_met", "n_a", "unknown"]);
export type RubricStatus = z.infer<typeof RubricStatus>;
