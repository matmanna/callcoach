import { CallStatus, FlagLabel, FlagStatus, RubricStatus } from "@sc/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// Enums come from packages/shared; never redefine them here.
export const flagLabelEnum = pgEnum("flag_label", FlagLabel.options as [FlagLabel, ...FlagLabel[]]);
export const flagStatusEnum = pgEnum("flag_status", FlagStatus.options as [FlagStatus, ...FlagStatus[]]);
export const callStatusEnum = pgEnum("call_status", CallStatus.options as [CallStatus, ...CallStatus[]]);
export const rubricStatusEnum = pgEnum("rubric_status", RubricStatus.options as [RubricStatus, ...RubricStatus[]]);

export const donors = pgTable("donors", {
  id: text("id").primaryKey(),
  first_name: text("first_name").notNull(),
  last_name: text("last_name").notNull(),
  spouse_name: text("spouse_name"),
  employer: text("employer"),
  town: text("town"),
  campaign: text("campaign").notNull(),
  gift_band: text("gift_band").notNull(),
  past_gift_count: integer("past_gift_count").notNull().default(0),
  last_gift_band: text("last_gift_band").notNull(),
  limits: jsonb("limits").$type<string[]>().notNull().default([]),
});

export const gifts = pgTable("gifts", {
  id: text("id").primaryKey(),
  donor_id: text("donor_id")
    .notNull()
    .references(() => donors.id),
  amount_band: text("amount_band").notNull(),
  campaign: text("campaign").notNull(),
  gift_date: timestamp("gift_date", { withTimezone: true, mode: "string" }).notNull(),
});

export const consents = pgTable("consents", {
  id: text("id").primaryKey(),
  call_id: text("call_id").notNull(),
  volunteer_id: text("volunteer_id").notNull(),
  consent_ts: timestamp("consent_ts", { withTimezone: true, mode: "string" }).notNull(),
});

// No transcript, raw-text, or cue-text column. Deliberate; see AGENTS.md invariants 1 and 5.
export const calls = pgTable(
  "calls",
  {
    id: text("id").primaryKey(),
    donor_id: text("donor_id")
      .notNull()
      .references(() => donors.id),
    volunteer_id: text("volunteer_id").notNull(),
    status: callStatusEnum("status").notNull().default("draft"),
    consent_id: text("consent_id").references(() => consents.id),
    started_at: timestamp("started_at", { withTimezone: true, mode: "string" }),
    ended_at: timestamp("ended_at", { withTimezone: true, mode: "string" }),
    draft_summary: text("draft_summary"),
    summary: text("summary"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    redaction_counts: jsonb("redaction_counts").$type<Record<string, number>>(),
    idempotency_key: text("idempotency_key").unique(),
    crm_record_id: text("crm_record_id"),
    approved_at: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    flags_error: text("flags_error"),
  },
  (t) => [index("calls_status_idx").on(t.status)],
);

export const flags = pgTable(
  "flags",
  {
    id: serial("id").primaryKey(),
    call_id: text("call_id")
      .notNull()
      .references(() => calls.id),
    label: flagLabelEnum("label").notNull(),
    reason: varchar("reason", { length: 160 }).notNull(),
    status: flagStatusEnum("status").notNull().default("proposed"),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [index("flags_status_label_idx").on(t.status, t.label)],
);

// Append-only. The migration adds a trigger that rejects UPDATE and DELETE.
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    who: text("who").notNull(),
    action: text("action").notNull(),
    flag_id: integer("flag_id"),
    call_id: text("call_id"),
    note: text("note"),
    ts: timestamp("ts", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_flag_ts_idx").on(t.flag_id, t.ts)],
);

export const rubricResults = pgTable("rubric_results", {
  id: serial("id").primaryKey(),
  call_id: text("call_id")
    .notNull()
    .references(() => calls.id),
  item_id: text("item_id").notNull(),
  status: rubricStatusEnum("status").notNull(),
  supporting_tags: text("supporting_tags").array().notNull().default(sql`'{}'::text[]`),
});

export const warmthRatings = pgTable(
  "warmth_ratings",
  {
    id: serial("id").primaryKey(),
    call_id: text("call_id")
      .notNull()
      .unique()
      .references(() => calls.id),
    volunteer_score: smallint("volunteer_score").notNull(),
    llm_score: smallint("llm_score"),
    llm_reason: varchar("llm_reason", { length: 160 }),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [
    check("warmth_volunteer_score_range", sql`${t.volunteer_score} BETWEEN 1 AND 5`),
    check("warmth_llm_score_range", sql`${t.llm_score} IS NULL OR ${t.llm_score} BETWEEN 1 AND 5`),
  ],
);

export const crmWrites = pgTable("crm_writes", {
  id: serial("id").primaryKey(),
  call_id: text("call_id")
    .notNull()
    .references(() => calls.id),
  record_id: text("record_id"),
  status: text("status").notNull(),
  attempted_at: timestamp("attempted_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});
