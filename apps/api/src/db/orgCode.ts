/**
 * `pnpm db:org-code`: makes a join code for the most recently created organization and prints it once.
 * Run it again to rotate. The old code stops working. Local and deployed databases alike.
 */
import { collections } from "./collections.ts";
import { createDeps } from "../deps.ts";
import { rotateJoinCode } from "../services/orgCodes.ts";

const deps = await createDeps();
try {
  const org = await collections(deps.db).organizations.findOne({}, { sort: { created_at: -1 } });
  if (!org) throw new Error("No organization yet. Sign up a coordinator first.");
  const actor = org.created_by;
  const { code } = await rotateJoinCode(deps, org._id, actor);
  console.log(`organization: ${org.name} (${org.slug})`);
  console.log(`join code: ${code}`);
  console.log("Shown once. Rotate again to get a new one.");
} finally {
  await deps.client.close();
}
