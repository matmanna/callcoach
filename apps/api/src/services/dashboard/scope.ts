/** Team scoping for coordinator views. Hiding a menu item is not access control; this is. */
import type { TeamDoc } from "@sc/shared";
import { MIN_CELL } from "@sc/shared";
import { requireCoordinator, requireRole, type Access } from "../../auth/access.ts";
import { HttpError } from "../../http.ts";

export interface Scope {
  orgId: string;
  /** team id param as sent, or null for "All teams". */
  teamId: string | null;
  /** The selected team and every descendant the user coordinates (or all coordinated teams). */
  teamIds: string[];
  teams: Map<string, TeamDoc>;
}

export function resolveScope(access: Access, teamIdParam: string | undefined | null): Scope {
  const orgId = requireCoordinator(access);
  const coordinated = new Map<string, TeamDoc>();
  for (const [id, role] of access.roles) if (role === "coordinator") coordinated.set(id, access.teams.get(id)!);

  if (!teamIdParam || teamIdParam === "all") return { orgId, teamId: null, teamIds: [...coordinated.keys()], teams: coordinated };

  requireRole(access, teamIdParam, "coordinator");
  const out = new Set<string>([teamIdParam]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const t of coordinated.values()) if (t.parent_team_id && out.has(t.parent_team_id) && !out.has(t._id)) (out.add(t._id), (grew = true));
  }
  const teams = new Map([...out].map((id) => [id, coordinated.get(id)!]));
  return { orgId, teamId: teamIdParam, teamIds: [...out], teams };
}

/** A count that is either shown or suppressed. A suppressed cell carries no number at all. */
export type Cell = { suppressed: true } | { n: number };
export const SUPPRESSED: Cell = { suppressed: true };

export function cell(n: number): Cell {
  return n < MIN_CELL ? SUPPRESSED : { n };
}

export const isShown = (c: Cell): c is { n: number } => "n" in c;

/** Parse an ISO date range (default: last 12 weeks), inclusive of `to`. */
export function parseRange(from: string | undefined, to: string | undefined, now: Date, defaultDays = 84): { from: Date; to: Date; fromStr: string; toStr: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !re.test(from)) || (to && !re.test(to))) throw new HttpError(400, "invalid_range");
  const toDate = to ? new Date(`${to}T23:59:59.999Z`) : now;
  const fromDate = from ? new Date(`${from}T00:00:00Z`) : new Date(toDate.getTime() - defaultDays * 86_400_000);
  if (fromDate > toDate) throw new HttpError(400, "invalid_range");
  return { from: fromDate, to: toDate, fromStr: fromDate.toISOString().slice(0, 10), toStr: toDate.toISOString().slice(0, 10) };
}

export const weekStart = (d: Date): string => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
