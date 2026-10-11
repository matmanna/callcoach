import type { MembershipDoc, TeamDoc, TeamRole } from "@sc/shared";
import { randomUUID } from "node:crypto";
import { requireRole, type Access } from "../auth/access.ts";
import { appendAudit } from "../db/audit.ts";
import { collections } from "../db/collections.ts";
import { withTx } from "../db/tx.ts";
import { HttpError, notFound } from "../http.ts";
import { nowOf, type Deps } from "./context.ts";
import { toUserKey } from "./orgs.ts";

/** Root (depth 0) -> team (1) -> subteam (2). Deeper nesting is rejected. */
export const MAX_TEAM_DEPTH = 2;

function depthOf(team: TeamDoc, all: Map<string, TeamDoc>): number {
  let d = 0;
  for (let t = team; t.parent_team_id && d < 10; d++) {
    const p = all.get(t.parent_team_id);
    if (!p) break;
    t = p;
  }
  return d;
}

export async function createTeam(deps: Deps, access: Access, orgId: string, input: { name: string; focus: string; parent_team_id: string | null }): Promise<TeamDoc> {
  const c = collections(deps.db);
  const root = await c.teams.findOne({ org_id: orgId, parent_team_id: null }, { sort: { created_at: 1 } });
  const parentId = input.parent_team_id ?? root?._id ?? null;
  if (!parentId) throw new HttpError(409, "onboarding_required");
  const parent = requireRole(access, parentId, "coordinator");
  const all = new Map((await c.teams.find({ org_id: orgId }).toArray()).map((t) => [t._id, t]));
  if (depthOf(parent, all) + 1 > MAX_TEAM_DEPTH) throw new HttpError(422, "max_depth", { max_depth: MAX_TEAM_DEPTH });
  const timezone = access.user.timezone ?? parent.timezone ?? null;
  const team: TeamDoc = { _id: randomUUID(), org_id: orgId, name: input.name, focus: input.focus, parent_team_id: parent._id, timezone, archived_at: null, created_at: nowOf(deps) };
  await withTx(deps.client, async (session) => {
    await c.teams.insertOne(team, { session });
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "team.create", target_type: "team", target_id: team._id }, session);
  });
  return team;
}

export async function updateTeam(deps: Deps, access: Access, orgId: string, teamId: string, patch: { name?: string; focus?: string }): Promise<TeamDoc> {
  requireRole(access, teamId, "coordinator");
  const c = collections(deps.db);
  const res = await c.teams.findOneAndUpdate({ _id: teamId, org_id: orgId }, { $set: patch }, { returnDocument: "after" });
  if (!res) throw notFound();
  await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "team.update", target_type: "team", target_id: teamId, note: Object.keys(patch).join(",") });
  return res;
}

/** Soft delete. Memberships are kept as history. The root team cannot be archived. */
export async function archiveTeam(deps: Deps, access: Access, orgId: string, teamId: string): Promise<void> {
  const team = requireRole(access, teamId, "coordinator");
  if (!team.parent_team_id) throw new HttpError(422, "cannot_archive_root");
  const c = collections(deps.db);
  await withTx(deps.client, async (session) => {
    await c.teams.updateOne({ _id: teamId, org_id: orgId }, { $set: { archived_at: nowOf(deps) } }, { session });
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "team.archive", target_type: "team", target_id: teamId }, session);
  });
}

export interface TeamNode extends TeamDoc {
  role: TeamRole;
  children: TeamNode[];
}

/** Visible teams as a tree. A visible team whose parent is hidden becomes a top-level node. */
export function teamTree(access: Access): TeamNode[] {
  const nodes = new Map<string, TeamNode>();
  for (const [id, t] of access.teams) nodes.set(id, { ...t, role: access.roles.get(id)!, children: [] });
  const roots: TeamNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parent_team_id ? nodes.get(n.parent_team_id) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const sort = (xs: TeamNode[]) => {
    xs.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    xs.forEach((x) => sort(x.children));
  };
  sort(roots);
  return roots;
}

export interface MemberView {
  membership_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  user_type: string;
  role: TeamRole;
  status: MembershipDoc["status"];
  joined_at: Date;
}

export async function listMembers(deps: Deps, access: Access, orgId: string, teamId: string): Promise<MemberView[]> {
  requireRole(access, teamId, "coordinator");
  const c = collections(deps.db);
  const ms = await c.memberships.find({ org_id: orgId, team_id: teamId }).sort({ joined_at: 1 }).toArray();
  const users = await c.users.find({ _id: { $in: ms.map((m) => toUserKey(m.user_id)) } }).toArray();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return ms.map((m) => {
    const u = byId.get(m.user_id);
    return {
      membership_id: m._id,
      user_id: m.user_id,
      email: u?.email ?? "",
      display_name: u?.display_name ?? u?.name ?? null,
      user_type: u?.user_type ?? "volunteer",
      role: m.role,
      status: m.status,
      joined_at: m.joined_at,
    };
  });
}

async function loadMembership(deps: Deps, access: Access, orgId: string, membershipId: string): Promise<MembershipDoc> {
  const m = await collections(deps.db).memberships.findOne({ _id: membershipId, org_id: orgId });
  if (!m) throw notFound();
  requireRole(access, m.team_id, "coordinator");
  return m;
}

export async function changeMemberRole(deps: Deps, access: Access, orgId: string, membershipId: string, role: TeamRole): Promise<void> {
  const m = await loadMembership(deps, access, orgId, membershipId);
  if (m.user_id === access.user.id) throw new HttpError(422, "cannot_change_own_role");
  const c = collections(deps.db);
  if (role === "coordinator") {
    const u = await c.users.findOne({ _id: toUserKey(m.user_id) });
    if (u?.user_type !== "coordinator") throw new HttpError(422, "volunteer_cannot_coordinate");
  }
  await withTx(deps.client, async (session) => {
    await c.memberships.updateOne({ _id: m._id }, { $set: { role } }, { session });
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "membership.role", target_type: "membership", target_id: m._id, note: `${m.role}->${role}` }, session);
  });
}

export async function removeMember(deps: Deps, access: Access, orgId: string, membershipId: string): Promise<void> {
  const m = await loadMembership(deps, access, orgId, membershipId);
  if (m.user_id === access.user.id) throw new HttpError(422, "cannot_remove_self");
  const c = collections(deps.db);
  await withTx(deps.client, async (session) => {
    await c.memberships.updateOne({ _id: m._id }, { $set: { status: "removed" } }, { session });
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "membership.remove", target_type: "membership", target_id: m._id }, session);
  });
}
