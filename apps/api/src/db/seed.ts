/**
 * Dev-only seed. Uses the same import code path as the coordinator site.
 * Creates (if missing) a synthetic coordinator, the org, two teams, then imports data/seed/*.
 */
import { loadAccess } from "../auth/access.ts";
import { createDeps } from "../deps.ts";
import { onboardCoordinator } from "../services/orgs.ts";
import { seedSampleData } from "../services/sample.ts";
import { collections } from "./collections.ts";
import { initDb } from "./init.ts";

const ORG_NAME = "Brightpath Youth Alliance";

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
  const result = await seedSampleData(deps, sessionUser, { force: true });
  console.log(result.skipped ? `sample data: ${result.skipped}` : `sample data: ${result.teams} teams, ${result.donors} donors, ${result.gifts} gifts, ${result.facts_approved} approved facts, rubric ${result.rubric}`);
  console.log(`seed done. Sign in as ${email} (password in .env).`);
} finally {
  await deps.client.close();
}
