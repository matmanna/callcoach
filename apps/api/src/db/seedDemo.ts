/**
 * `pnpm db:seed:demo`: synthetic call activity for the seed coordinator's organization. Local
 * development only. The work itself is in services/demoActivity.ts.
 */
import { collections } from "./collections.ts";
import { createDeps } from "../deps.ts";
import { seedDemoActivity } from "../services/demoActivity.ts";

const deps = await createDeps();
try {
  if (/mongodb\+srv|atlas/i.test(process.env.MONGODB_URI ?? "")) throw new Error("seed:demo is for local development only");
  const c = collections(deps.db);
  // The organization of the seed coordinator, not whichever organization the database returns first.
  const seedCoordinator = await c.users.findOne({ email: process.env.SEED_COORDINATOR_EMAIL ?? "coordinator@example.org" });
  const membership = seedCoordinator ? await c.memberships.findOne({ user_id: String(seedCoordinator._id), status: "active" }) : null;
  const org = membership ? await c.organizations.findOne({ _id: membership.org_id }) : null;
  if (!org || !seedCoordinator) throw new Error("Run pnpm db:seed first");
  const teams = await c.teams.find({ org_id: org._id, name: { $in: ["Student Callers", "Alumni Callers"] } }).toArray();
  if (!teams.length) throw new Error("Run pnpm db:seed first");
  const r = await seedDemoActivity(deps, { orgId: org._id, callerId: String(seedCoordinator._id), teams });
  console.log(`demo activity: ${r.logs} logs, ${r.flags} flags, ${r.follow_ups} follow-ups, ${r.ratings} ratings`);
} finally {
  await deps.client.close();
}
