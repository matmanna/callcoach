/**
 * MongoDB document types for identity, teams, invites, seed data, and audit (Prompt S2).
 * Single source of truth: the API validates with these and the web app builds forms from them.
 * IDs are strings (UUIDs for our collections; Better Auth user ids for users).
 */
import { z } from "zod";
import { Tag } from "./enums.ts";

export const UserType = z.enum(["coordinator", "volunteer"]);
export type UserType = z.infer<typeof UserType>;

export const TeamRole = z.enum(["coordinator", "caller"]);
export type TeamRole = z.infer<typeof TeamRole>;

export const MembershipStatus = z.enum(["active", "removed"]);
export type MembershipStatus = z.infer<typeof MembershipStatus>;

export const SeedKind = z.enum(["donors", "gifts", "fact_sheet", "rubric"]);
export type SeedKind = z.infer<typeof SeedKind>;

export const FactItemStatus = z.enum(["draft", "approved"]);
export type FactItemStatus = z.infer<typeof FactItemStatus>;

/** IANA time zone, checked against the runtime's tz database. */
export const Timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "unknown IANA time zone");

const id = z.string().min(1);
const name = z.string().trim().min(1, "required").max(120);

/** Extra fields Better Auth stores on its `users` collection. */
export const UserProfileFields = z.object({
  user_type: UserType,
  display_name: name,
  timezone: Timezone,
  created_at: z.date(),
});

export const OrganizationDoc = z.object({
  _id: id,
  name,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  created_by: id,
  created_at: z.date(),
});
export type OrganizationDoc = z.infer<typeof OrganizationDoc>;

export const TeamDoc = z.object({
  _id: id,
  org_id: id,
  name,
  focus: z.string().trim().max(200),
  /** Added in P2; older S2 teams inherit from the org root or use the configured default. */
  timezone: Timezone.optional(),
  parent_team_id: id.nullable(),
  archived_at: z.date().nullable(),
  created_at: z.date(),
});
export type TeamDoc = z.infer<typeof TeamDoc>;

export const MembershipDoc = z.object({
  _id: id,
  org_id: id,
  user_id: id,
  team_id: id,
  role: TeamRole,
  status: MembershipStatus,
  joined_at: z.date(),
});
export type MembershipDoc = z.infer<typeof MembershipDoc>;

export const InviteDoc = z.object({
  _id: id,
  org_id: id,
  team_id: id,
  email: z.email(),
  role: TeamRole,
  /** SHA-256 hex of the token. The raw token is never stored. */
  token_hash: z.string().regex(/^[0-9a-f]{64}$/),
  invited_by: id,
  created_at: z.date(),
  expires_at: z.date(),
  accepted_at: z.date().nullable(),
  accepted_by: id.nullable(),
  revoked_at: z.date().nullable(),
});
export type InviteDoc = z.infer<typeof InviteDoc>;

export const DonorDoc = z.object({
  _id: id,
  org_id: id,
  external_id: z.string().trim().min(1).max(64),
  team_ids: z.array(id),
  first_name: name,
  last_name: name,
  spouse_name: z.string().trim().max(120).nullable(),
  employer: z.string().trim().max(120).nullable(),
  town: z.string().trim().max(120).nullable(),
  campaign: name,
  gift_band: z.string().trim().min(1).max(40),
  past_gift_count: z.number().int().nonnegative(),
  last_gift_band: z.string().trim().min(1).max(40),
  limits: z.array(z.string().trim().min(1).max(200)),
  timezone_hint: Timezone.nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type DonorDoc = z.infer<typeof DonorDoc>;

export const GiftDoc = z.object({
  _id: id,
  org_id: id,
  external_id: z.string().trim().min(1).max(64),
  donor_id: id,
  amount_band: z.string().trim().min(1).max(40),
  campaign: name,
  gift_date: z.date(),
});
export type GiftDoc = z.infer<typeof GiftDoc>;

export const CampaignDoc = z.object({
  _id: id,
  org_id: id,
  name,
  description: z.string().max(500),
  fact_sheet_ids: z.array(id),
});
export type CampaignDoc = z.infer<typeof CampaignDoc>;

export const FactItem = z.object({
  id,
  text: z.string().trim().min(1).max(500),
  source: z.string().trim().min(1).max(200),
  verified_on: z.iso.date(),
  owner_user_id: id,
  status: FactItemStatus,
});
export type FactItem = z.infer<typeof FactItem>;

export const FactSheetDoc = z.object({
  _id: id,
  org_id: id,
  name,
  items: z.array(FactItem),
  created_at: z.date(),
});
export type FactSheetDoc = z.infer<typeof FactSheetDoc>;

export const RubricItemDoc = z.object({
  id,
  text: z.string().trim().min(1).max(300),
  supporting_tags: z.array(Tag),
  conditional_on_tag: Tag.nullable(),
});

export const RubricDoc = z.object({
  _id: id,
  org_id: id,
  team_id: id.nullable(),
  items: z.array(RubricItemDoc).min(1),
  created_at: z.date(),
});
export type RubricDoc = z.infer<typeof RubricDoc>;

export const RejectedRow = z.object({ row: z.number().int().positive(), reasons: z.array(z.string()) , values: z.record(z.string(), z.string()) });
export type RejectedRow = z.infer<typeof RejectedRow>;

export const SeedRunDoc = z.object({
  _id: id,
  org_id: id,
  kind: SeedKind,
  file_name: z.string().max(200),
  row_count: z.number().int().nonnegative(),
  accepted_count: z.number().int().nonnegative(),
  updated_count: z.number().int().nonnegative(),
  rejected_count: z.number().int().nonnegative(),
  /** Rejected rows with reasons, for the downloadable rejects file. Capped at 500. */
  rejected_rows: z.array(RejectedRow),
  created_by: id,
  created_at: z.date(),
  status: z.enum(["completed", "failed"]),
});
export type SeedRunDoc = z.infer<typeof SeedRunDoc>;

export const AuditDoc = z.object({
  _id: id,
  org_id: id,
  who: id,
  action: z.string().min(1).max(80),
  target_type: z.string().min(1).max(40),
  target_id: id,
  note: z.string().max(500).nullable(),
  ts: z.date(),
});
export type AuditDoc = z.infer<typeof AuditDoc>;

// ---------- API request bodies (shared with web forms) ----------

export const CoordinatorOnboarding = z.strictObject({ display_name: name, org_name: name, timezone: Timezone });
export const CreateTeam = z.strictObject({ name, focus: z.string().trim().max(200).default(""), parent_team_id: id.nullable().default(null), timezone: Timezone.optional() });
export const UpdateTeam = z.strictObject({ focus: z.string().trim().max(200).optional(), name: name.optional(), timezone: Timezone.optional() });
export const CreateInvite = z.strictObject({ email: z.email(), role: TeamRole });
export const AcceptInvite = z.strictObject({
  token: z.string().min(20).max(200),
  password: z.string().min(10).max(128).optional(),
  display_name: name.optional(),
  timezone: Timezone.optional(),
});
export const ChangeMemberRole = z.strictObject({ role: TeamRole });
export const UpdateProfile = z.strictObject({ display_name: name.optional(), timezone: Timezone.optional() });

/** Columns the importer refuses outright: raw call content never enters the system. */
export const FORBIDDEN_IMPORT_COLUMN = /transcript|audio|notes?_raw/i;

export const DonorCsvRow = z.object({
  external_id: z.string().trim().min(1).max(64),
  first_name: name,
  last_name: name,
  spouse_name: z.string().trim().max(120).optional().transform((v) => v || null),
  employer: z.string().trim().max(120).optional().transform((v) => v || null),
  town: z.string().trim().max(120).optional().transform((v) => v || null),
  campaign: name,
  gift_band: z.string().trim().min(1).max(40),
  past_gift_count: z.coerce.number().int().nonnegative(),
  last_gift_band: z.string().trim().min(1).max(40),
  limits: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(";").map((s) => s.trim()).filter(Boolean)),
  team_name: name,
});
export const DONOR_COLUMNS = ["external_id", "first_name", "last_name", "spouse_name", "employer", "town", "campaign", "gift_band", "past_gift_count", "last_gift_band", "limits", "team_name"] as const;

export const GiftCsvRow = z.object({
  external_id: z.string().trim().min(1).max(64),
  donor_external_id: z.string().trim().min(1).max(64),
  amount_band: z.string().trim().min(1).max(40),
  campaign: name,
  gift_date: z.iso.date(),
});
export const GIFT_COLUMNS = ["external_id", "donor_external_id", "amount_band", "campaign", "gift_date"] as const;

export const FactSheetImportRow = z.object({
  text: z.string().trim().min(1).max(500),
  source: z.string().trim().min(1, "source is required").max(200),
  verified_on: z.iso.date("verified_on must be YYYY-MM-DD"),
  owner_email: z.email().optional(),
});
export const FACT_COLUMNS = ["text", "source", "verified_on", "owner_email"] as const;

export const RubricImportFile = z.object({
  items: z
    .array(
      z.object({
        id,
        text: z.string().trim().min(1).max(300),
        supporting_tags: z.array(Tag),
        conditional_on_tag: Tag.optional().nullable(),
      }),
    )
    .min(1),
});
