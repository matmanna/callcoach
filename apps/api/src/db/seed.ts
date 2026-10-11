/**
 * Dev-only seed. Uses the same import code path as the coordinator site.
 * Creates (if missing) a synthetic coordinator, the org, two teams, then imports data/seed/*.
 */
import { readFileSync } from "node:fs";
import { loadAccess } from "../auth/access.ts";
import { createDeps } from "../deps.ts";
import { commitImport } from "../imports/importer.ts";
import { onboardCoordinator } from "../services/orgs.ts";
import { createTeam } from "../services/teams.ts";
import { collections } from "./collections.ts";
import { initDb } from "./init.ts";
import { appendAudit } from "./audit.ts";
import { withTx } from "./tx.ts";

const ORG_NAME = "Brightpath Youth Alliance";
const TEAMS = [
  { name: "Student Callers", focus: "student calling, local donors" },
  { name: "Alumni Callers", focus: "alumni calling, long-time donors" },
];
const seedFile = (name: string) => readFileSync(new URL(`../../../../data/seed/${name}`, import.meta.url), "utf8");

const deps = await createDeps();
try {
  await initDb(deps.db, (s) => console.log(`init: ${s}`));
  const c = collections(deps.db);
  const email = (process.env.SEED_COORDINATOR_EMAIL ?? "coordinator@example.org").toLowerCase();
  const password = process.env.SEED_COORDINATOR_PASSWORD;
  if (!password) throw new Error("SEED_COORDINATOR_PASSWORD is not set (see .env.example)");

  let user = await c.users.findOne({ email });
  if (!user) {
    await deps.auth.api.signUpEmail({ body: { email, password, name: "Dev Coordinator", user_type: "coordinator", display_name: "Dev Coordinator", timezone: "America/New_York" } });
    user = await c.users.findOne({ email });
    console.log(`created coordinator ${email}`);
  }
  if (!user) throw new Error("coordinator not created");
  const sessionUser = { id: String(user._id), email, name: user.name, user_type: "coordinator" as const, display_name: user.display_name ?? null, timezone: user.timezone ?? null };

  let access = await loadAccess(deps.db, sessionUser);
  if (!access.orgId) {
    await onboardCoordinator(deps, sessionUser, { display_name: "Dev Coordinator", org_name: ORG_NAME, timezone: "America/New_York" });
    access = await loadAccess(deps.db, sessionUser);
    console.log(`created org ${ORG_NAME}`);
  }
  const orgId = access.orgId!;
  for (const t of TEAMS) {
    if (!(await c.teams.findOne({ org_id: orgId, name: t.name }))) {
      await createTeam(deps, access, orgId, { ...t, parent_team_id: null });
      access = await loadAccess(deps.db, sessionUser);
      console.log(`created team ${t.name}`);
    }
  }

  const report = (kind: string, r: Awaited<ReturnType<typeof commitImport>>) =>
    console.log(`import ${kind}: accepted ${r.seed_run.accepted_count}, updated ${r.seed_run.updated_count}, rejected ${r.seed_run.rejected_count}`);
  report("donors", await commitImport(deps, access, orgId, "donors", { file_name: "donors.csv", content: seedFile("donors.csv"), update_existing: true }));
  report("gifts", await commitImport(deps, access, orgId, "gifts", { file_name: "gifts.csv", content: seedFile("gifts.csv"), update_existing: true }));
  if (!(await c.fact_sheets.findOne({ org_id: orgId, name: "fact-sheet.json" }))) {
    report("fact_sheet", await commitImport(deps, access, orgId, "fact_sheet", { file_name: "fact-sheet.json", content: seedFile("fact-sheet.json"), update_existing: false, campaign_name: "Spring Youth Appeal 2026" }));
  }
  // The synthetic demo has one coordinator-approved fact ready for the pre-call brief.
  const demoSheet = await c.fact_sheets.findOne({ org_id: orgId, name: "fact-sheet.json" });
  const demoFact = demoSheet?.items[0];
  if (demoSheet && demoFact?.status === "draft") {
    await withTx(deps.client, async (session) => {
      await c.fact_sheets.updateOne({ _id: demoSheet._id, org_id: orgId, items: { $elemMatch: { id: demoFact.id, status: "draft" } } }, { $set: { "items.$.status": "approved" } }, { session });
      await appendAudit(deps.db, { org_id: orgId, who: sessionUser.id, action: "fact.approve", target_type: "fact_item", target_id: demoFact.id }, session);
    });
  }
  if (!(await c.rubrics.findOne({ org_id: orgId, team_id: null }))) {
    report("rubric", await commitImport(deps, access, orgId, "rubric", { file_name: "rubric.json", content: seedFile("rubric.json"), update_existing: false, team_id: null }));
  }
  console.log(`seed done. Sign in as ${email} (password in .env).`);
} finally {
  await deps.client.close();
}
