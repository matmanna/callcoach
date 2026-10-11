CREATE TYPE "public"."call_status" AS ENUM('draft', 'approved', 'flags_pending', 'flags_ready', 'flags_failed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."flag_label" AS ENUM('DISTRESS', 'STOP_CONTACT', 'OFF_SCRIPT_CLAIM', 'PLANNED_GIVING', 'ENGAGE_MORE');--> statement-breakpoint
CREATE TYPE "public"."flag_status" AS ENUM('proposed', 'approved', 'overridden', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."rubric_status" AS ENUM('met', 'not_met', 'n_a', 'unknown');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"who" text NOT NULL,
	"action" text NOT NULL,
	"flag_id" integer,
	"call_id" text,
	"note" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" text PRIMARY KEY NOT NULL,
	"donor_id" text NOT NULL,
	"volunteer_id" text NOT NULL,
	"status" "call_status" DEFAULT 'draft' NOT NULL,
	"consent_id" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"draft_summary" text,
	"summary" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"redaction_counts" jsonb,
	"idempotency_key" text,
	"crm_record_id" text,
	"approved_at" timestamp with time zone,
	"flags_error" text,
	CONSTRAINT "calls_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"volunteer_id" text NOT NULL,
	"consent_ts" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_writes" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"record_id" text,
	"status" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"spouse_name" text,
	"employer" text,
	"town" text,
	"campaign" text NOT NULL,
	"gift_band" text NOT NULL,
	"past_gift_count" integer DEFAULT 0 NOT NULL,
	"last_gift_band" text NOT NULL,
	"limits" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"label" "flag_label" NOT NULL,
	"reason" varchar(160) NOT NULL,
	"status" "flag_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gifts" (
	"id" text PRIMARY KEY NOT NULL,
	"donor_id" text NOT NULL,
	"amount_band" text NOT NULL,
	"campaign" text NOT NULL,
	"gift_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"item_id" text NOT NULL,
	"status" "rubric_status" NOT NULL,
	"supporting_tags" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warmth_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"volunteer_score" smallint NOT NULL,
	"llm_score" smallint,
	"llm_reason" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warmth_ratings_call_id_unique" UNIQUE("call_id"),
	CONSTRAINT "warmth_volunteer_score_range" CHECK ("warmth_ratings"."volunteer_score" BETWEEN 1 AND 5),
	CONSTRAINT "warmth_llm_score_range" CHECK ("warmth_ratings"."llm_score" IS NULL OR "warmth_ratings"."llm_score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_writes" ADD CONSTRAINT "crm_writes_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_results" ADD CONSTRAINT "rubric_results_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmth_ratings" ADD CONSTRAINT "warmth_ratings_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_flag_ts_idx" ON "audit_log" USING btree ("flag_id","ts");--> statement-breakpoint
CREATE INDEX "calls_status_idx" ON "calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "flags_status_label_idx" ON "flags" USING btree ("status","label");--> statement-breakpoint
-- audit_log is append-only. Hand-written addition to the generated migration.
CREATE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
