/**
 * Read shapes for the P2 collections (call_logs, flags, pending_limits, follow_ups,
 * warmth_ratings), exactly as Prompt P2 specifies them. K3 reads them and applies coordinator
 * decisions (queue, pending limits, cancel). When P2 merges, replace these with its shared types.
 * Nothing here has a note, transcript, or audio field.
 */
import type { Db } from "mongodb";

export interface LogFieldsDoc {
  outcome: "reached" | "voicemail" | "no_answer" | "declined" | "rescheduled";
  donor_stated_reason: string;
  preference: "none" | "email_preferred" | "stop_calls" | "call_later";
  follow_up: { needed: boolean; action: string; due_date: string | null };
  flags: Array<"DISTRESS" | "STOP_CONTACT" | "OFF_SCRIPT_CLAIM">;
}

export interface CallLogRow {
  _id: string;
  org_id: string;
  team_id: string;
  donor_id: string;
  caller_id: string;
  status: "draft" | "approved";
  draft: LogFieldsDoc;
  model_draft: string;
  approved: LogFieldsDoc | null;
  approved_at: Date | null;
  corrects_log_id: string | null;
  created_at: Date;
}

export interface FlagRow {
  _id: string;
  org_id: string;
  team_id: string;
  donor_id: string;
  log_id: string;
  label: "DISTRESS" | "STOP_CONTACT" | "OFF_SCRIPT_CLAIM";
  reason: string;
  status: "proposed" | "approved" | "overridden" | "resolved";
  created_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
}

export interface PendingLimitRow {
  _id: string;
  org_id: string;
  team_id: string;
  donor_id: string;
  log_id: string;
  limit: string;
  status: "pending" | "approved" | "rejected";
  created_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
}

export interface FollowUpRow {
  _id: string;
  org_id: string;
  donor_id: string;
  team_id: string;
  owner_user_id: string;
  action: string;
  due_date: string | null;
  status: "open" | "done" | "handed_off" | "cancelled";
  created_from_log_id: string;
  created_at: Date;
  closed_at: Date | null;
  last_note: string | null;
}

export interface WarmthRow {
  _id: string;
  org_id: string;
  team_id: string;
  call_id: string;
  caller_id: string;
  volunteer_score: number;
  llm_score: number | null;
  llm_reason: string | null;
  created_at: Date;
}

export function p2(db: Db) {
  return {
    call_logs: db.collection<CallLogRow>("call_logs"),
    flags: db.collection<FlagRow>("flags"),
    pending_limits: db.collection<PendingLimitRow>("pending_limits"),
    follow_ups: db.collection<FollowUpRow>("follow_ups"),
    warmth_ratings: db.collection<WarmthRow>("warmth_ratings"),
  };
}
