/** Typed collection handles. `audit_log` is deliberately absent: use db/audit.ts (append and read only). */
import type {
  DonorLimitDoc,
  FactItemVersionDoc,
  HandoffPacketDoc,
  KnowledgeEntryDoc,
  PatternDoc,
  RubricVersionDoc,
  CampaignDoc,
  DonorDoc,
  FactSheetDoc,
  GiftDoc,
  InviteDoc,
  MembershipDoc,
  OrganizationDoc,
  RubricDoc,
  SeedRunDoc,
  TeamDoc,
} from "@sc/shared";
import type { Db, ObjectId } from "mongodb";

/** Better Auth's user document (usePlural: true -> `users`), with our additional fields. */
export interface AuthUserDoc {
  _id: ObjectId | string;
  email: string;
  name: string;
  user_type: "coordinator" | "volunteer";
  display_name?: string | null;
  timezone?: string | null;
  createdAt: Date;
}

export function collections(db: Db) {
  return {
    users: db.collection<AuthUserDoc>("users"),
    organizations: db.collection<OrganizationDoc>("organizations"),
    teams: db.collection<TeamDoc>("teams"),
    memberships: db.collection<MembershipDoc>("memberships"),
    invites: db.collection<InviteDoc>("invites"),
    donors: db.collection<DonorDoc>("donors"),
    gifts: db.collection<GiftDoc>("gifts"),
    campaigns: db.collection<CampaignDoc>("campaigns"),
    fact_sheets: db.collection<FactSheetDoc>("fact_sheets"),
    rubrics: db.collection<RubricDoc>("rubrics"),
    seed_runs: db.collection<SeedRunDoc>("seed_runs"),
    donor_limits: db.collection<DonorLimitDoc>("donor_limits"),
    fact_item_versions: db.collection<FactItemVersionDoc>("fact_item_versions"),
    rubric_versions: db.collection<RubricVersionDoc>("rubric_versions"),
    knowledge_entries: db.collection<KnowledgeEntryDoc>("knowledge_entries"),
    handoff_packets: db.collection<HandoffPacketDoc>("handoff_packets"),
    patterns: db.collection<PatternDoc>("patterns"),
  };
}
export type Collections = ReturnType<typeof collections>;

/** Every tenant collection, including ones only later prompts write. Used by db:init and the app role. */
export const TENANT_COLLECTIONS = [
  "organizations",
  "teams",
  "memberships",
  "invites",
  "donors",
  "gifts",
  "campaigns",
  "fact_sheets",
  "rubrics",
  "seed_runs",
  "donor_limits",
  "fact_item_versions",
  "rubric_versions",
  "knowledge_entries",
  "handoff_packets",
  "patterns",
] as const;
export const AUTH_COLLECTIONS = ["users", "sessions", "accounts", "verifications"] as const;
export const AUDIT_COLLECTION = "audit_log";
