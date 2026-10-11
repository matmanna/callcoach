import type { OrganizationDoc, TeamDoc } from "@sc/shared";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { appendAudit } from "../db/audit.ts";
import { collections } from "../db/collections.ts";
import { withTx } from "../db/tx.ts";
import { HttpError } from "../http.ts";
import { nowOf, type Deps } from "./context.ts";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
}

/** Coordinator onboarding: profile, organization, and a root team named after it. */
export async function onboardCoordinator(
  deps: Deps,
  user: { id: string; user_type: string },
  input: { display_name: string; org_name: string; timezone: string },
): Promise<{ org: OrganizationDoc; rootTeam: TeamDoc }> {
  if (user.user_type !== "coordinator") throw new HttpError(403, "forbidden");
  const c = collections(deps.db);
  if (await c.memberships.findOne({ user_id: user.id, status: "active" })) throw new HttpError(409, "already_onboarded");
  const now = nowOf(deps);
  const base = slugify(input.org_name);
  let slug = base;
  for (let i = 2; await c.organizations.findOne({ slug }); i++) slug = `${base}-${i}`;
  const org: OrganizationDoc = { _id: randomUUID(), name: input.org_name, slug, created_by: user.id, created_at: now };
  const rootTeam: TeamDoc = { _id: randomUUID(), org_id: org._id, name: input.org_name, focus: "", timezone: input.timezone, parent_team_id: null, archived_at: null, created_at: now };
  await withTx(deps.client, async (session) => {
    await c.organizations.insertOne(org, { session });
    await c.teams.insertOne(rootTeam, { session });
    await c.memberships.insertOne(
      { _id: randomUUID(), org_id: org._id, user_id: user.id, team_id: rootTeam._id, role: "coordinator", status: "active", joined_at: now },
      { session },
    );
    await c.users.updateOne({ _id: toUserKey(user.id) }, { $set: { display_name: input.display_name, timezone: input.timezone, name: input.display_name } }, { session });
    await appendAudit(deps.db, { org_id: org._id, who: user.id, action: "org.create", target_type: "organization", target_id: org._id }, session);
  });
  return { org, rootTeam };
}

/** Better Auth's Mongo adapter stores user _id as an ObjectId; our ids are its hex string. */
export function toUserKey(id: string): ObjectId | string {
  return ObjectId.isValid(id) && id.length === 24 ? new ObjectId(id) : id;
}
