/**
 * Sample data for new organizations. Every coordinator who signs up gets two teams, ten
 * synthetic donors with gifts, an approved fact sheet, and a rubric, so a volunteer they invite
 * has donors to call straight away. Uses the same import code path as the coordinator site.
 *
 * Enabled by AUTO_SEED_SAMPLE_DATA=1 (set in the deployed stacks and .env.example; off in tests).
 * Never blocks onboarding: failures are logged and the organization is left as created.
 */
import { DONOR_COLUMNS, GIFT_COLUMNS, type UserType } from "@sc/shared";
import Papa from "papaparse";
import { loadAccess } from "../auth/access.ts";
import { collections } from "../db/collections.ts";
import { commitImport } from "../imports/importer.ts";
import { SAMPLE_CAMPAIGN, SAMPLE_DONORS, SAMPLE_FACTS, SAMPLE_GIFTS, SAMPLE_RUBRIC, SAMPLE_TEAMS } from "../sample/sampleData.ts";
import type { Deps } from "./context.ts";
import { approveVersion, loadSheet } from "./dashboard/facts.ts";
import { createTeam } from "./teams.ts";

export const sampleSeedEnabled = (env: NodeJS.ProcessEnv) => env.AUTO_SEED_SAMPLE_DATA === "1";

const toCsv = (columns: readonly string[], rows: ReadonlyArray<Record<string, string>>) => Papa.unparse({ fields: [...columns], data: rows.map((r) => columns.map((c) => r[c] ?? "")) });

export interface SampleUser {
  id: string;
  email: string;
  name: string;
  user_type: UserType;
  display_name: string | null;
  timezone: string | null;
}

export interface SampleResult {
  skipped?: "disabled" | "already_seeded";
  teams: number;
  donors: number;
  gifts: number;
  facts_approved: number;
  rubric: boolean;
}

/** Idempotent: an organization that already has donors is left alone. `force` ignores the env flag (dev seed). */
export async function seedSampleData(deps: Deps, user: SampleUser, opts: { force?: boolean } = {}): Promise<SampleResult> {
  const empty: SampleResult = { teams: 0, donors: 0, gifts: 0, facts_approved: 0, rubric: false };
  if (!opts.force && !sampleSeedEnabled(deps.env)) return { ...empty, skipped: "disabled" };

  const c = collections(deps.db);
  let access = await loadAccess(deps.db, user);
  const orgId = access.orgId;
  if (!orgId) throw new Error("organization not created yet");
  if (await c.donors.countDocuments({ org_id: orgId }, { limit: 1 })) return { ...empty, skipped: "already_seeded" };

  const result = { ...empty };
  for (const t of SAMPLE_TEAMS) {
    if (!(await c.teams.findOne({ org_id: orgId, name: t.name }))) {
      await createTeam(deps, access, orgId, { ...t, parent_team_id: null });
      access = await loadAccess(deps.db, user);
      result.teams += 1;
    }
  }

  const donors = await commitImport(deps, access, orgId, "donors", { file_name: "sample-donors.csv", content: toCsv(DONOR_COLUMNS, SAMPLE_DONORS), update_existing: false });
  result.donors = donors.seed_run.accepted_count;
  const gifts = await commitImport(deps, access, orgId, "gifts", { file_name: "sample-gifts.csv", content: toCsv(GIFT_COLUMNS, SAMPLE_GIFTS), update_existing: false });
  result.gifts = gifts.seed_run.accepted_count;

  await commitImport(deps, access, orgId, "fact_sheet", {
    file_name: "sample-fact-sheet.json",
    content: JSON.stringify({ items: SAMPLE_FACTS }),
    update_existing: false,
    campaign_name: SAMPLE_CAMPAIGN,
  });
  // Approve the sample facts (a single coordinator self-approves, recorded in the audit log) so briefs show them.
  const sheet = await c.fact_sheets.findOne({ org_id: orgId, name: "sample-fact-sheet.json" });
  if (sheet) {
    await loadSheet(deps, orgId, sheet._id);
    for (const item of sheet.items) {
      await approveVersion(deps, access, orgId, sheet._id, item.id, 1, "sample data");
      result.facts_approved += 1;
    }
  }

  const rubric = await commitImport(deps, access, orgId, "rubric", { file_name: "sample-rubric.json", content: JSON.stringify(SAMPLE_RUBRIC), update_existing: false, team_id: null });
  result.rubric = rubric.seed_run.accepted_count > 0;
  return result;
}

/** Called from onboarding. Swallows errors so a seeding problem never blocks sign-up. */
export async function seedSampleDataSafely(deps: Deps, user: SampleUser): Promise<void> {
  try {
    await seedSampleData(deps, user);
  } catch (err) {
    console.error("[sample] seeding failed:", err instanceof Error ? err.name : "error");
  }
}
