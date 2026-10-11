/**
 * Authorization. `requireRole` is the single place team access is decided.
 *
 * - A user's org comes from their active memberships (one org per user in this build).
 * - Effective role on a team = the strongest active membership on that team or any ancestor,
 *   so a coordinator of a parent team covers its subteams, and the org creator (coordinator of
 *   the root team) covers the whole org.
 * - Not visible at all (other org, or a team the user has no path to) -> 404.
 * - Visible but role too weak, or a volunteer asking for coordinator rights -> 403.
 */
import type { MembershipDoc, TeamDoc, TeamRole, UserType } from "@sc/shared";
import type { Db } from "mongodb";
import { collections } from "../db/collections.ts";
import { HttpError, forbidden, notFound } from "../http.ts";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  user_type: UserType;
  display_name: string | null;
  timezone: string | null;
  /** Optional so callers that build a user from a seed or invite do not have to supply them. */
  service_scope?: "local" | "national" | "global" | null;
  home_region?: string | null;
}

export interface Access {
  user: SessionUser;
  orgId: string | null;
  /** Non-archived teams in the user's org that they can see, with the effective role. */
  roles: Map<string, TeamRole>;
  teams: Map<string, TeamDoc>;
  memberships: MembershipDoc[];
}

const RANK: Record<TeamRole, number> = { caller: 1, coordinator: 2 };

export async function loadAccess(db: Db, user: SessionUser): Promise<Access> {
  const c = collections(db);
  const memberships = await c.memberships.find({ user_id: user.id, status: "active" }).toArray();
  const orgId = memberships[0]?.org_id ?? (await c.organizations.findOne({ created_by: user.id }))?._id ?? null;
  const roles = new Map<string, TeamRole>();
  const teams = new Map<string, TeamDoc>();
  if (!orgId) return { user, orgId: null, roles, teams, memberships: [] };

  const orgTeams = await c.teams.find({ org_id: orgId }).toArray();
  const byId = new Map(orgTeams.map((t) => [t._id, t]));
  const direct = new Map<string, TeamRole>();
  for (const m of memberships) if (m.org_id === orgId) direct.set(m.team_id, m.role);

  for (const team of orgTeams) {
    if (team.archived_at) continue;
    let best: TeamRole | null = null;
    // Walk up the parent chain (max depth is small; guard against cycles anyway).
    let cur: TeamDoc | undefined = team;
    for (let hops = 0; cur && hops < 10; hops++) {
      const r = direct.get(cur._id);
      // Inherited access flows down only for coordinators; callers see only their own teams.
      if (r && (cur._id === team._id || r === "coordinator") && (!best || RANK[r] > RANK[best])) best = r;
      cur = cur.parent_team_id ? byId.get(cur.parent_team_id) : undefined;
    }
    if (best) {
      roles.set(team._id, best);
      teams.set(team._id, team);
    }
  }
  return { user, orgId, roles, teams, memberships: memberships.filter((m) => m.org_id === orgId) };
}

export function requireOrg(access: Access): string {
  if (!access.orgId) throw new HttpError(409, "onboarding_required");
  return access.orgId;
}

/** The single authorization check. Returns the team on success. */
export function requireRole(access: Access, teamId: string, role: TeamRole): TeamDoc {
  const team = access.teams.get(teamId);
  const effective = access.roles.get(teamId);
  if (!team || !effective) throw notFound();
  if (RANK[effective] < RANK[role]) throw forbidden();
  if (role === "coordinator" && access.user.user_type !== "coordinator") throw forbidden();
  return team;
}

/** Org-wide coordinator actions (imports, fact-sheet approval): coordinator of any team in the org. */
export function requireCoordinator(access: Access): string {
  const orgId = requireOrg(access);
  if (access.user.user_type !== "coordinator" || ![...access.roles.values()].includes("coordinator")) throw forbidden();
  return orgId;
}

export function teamsWithRole(access: Access, role: TeamRole): string[] {
  return [...access.roles.entries()].filter(([, r]) => RANK[r] >= RANK[role]).map(([id]) => id);
}
