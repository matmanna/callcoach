/**
 * Volunteers. No rankings: sort keys are limited to name, team, joined, last activity, and no
 * response carries a rank or performance field. Per-volunteer trends are for discussion with
 * that volunteer, never an evaluation, and baselines are suppressed under the minimum cell.
 */
import { MIN_CELL, VOLUNTEER_SORT_KEYS, type DonorSegment, DONOR_SEGMENTS } from "@sc/shared";
import type { Access } from "../../auth/access.ts";
import { appendAudit } from "../../db/audit.ts";
import { collections } from "../../db/collections.ts";
import { HttpError, notFound } from "../../http.ts";
import { toUserKey } from "../orgs.ts";
import { nowOf, type Deps } from "../context.ts";
import { donorSegment, lastGiftByDonor } from "./contacts.ts";
import { p2 } from "./p2Docs.ts";
import { cell, weekStart, type Scope } from "./scope.ts";
import { todayIn } from "./util.ts";

export type VolunteerSort = (typeof VOLUNTEER_SORT_KEYS)[number];

export function parseVolunteerSort(raw: string | undefined): VolunteerSort {
  if (!raw) return "name";
  if ((VOLUNTEER_SORT_KEYS as readonly string[]).includes(raw)) return raw as VolunteerSort;
  throw new HttpError(400, "sort_not_allowed", { allowed: VOLUNTEER_SORT_KEYS });
}

export async function listVolunteers(deps: Deps, scope: Scope, q: { sort: VolunteerSort; dir: "asc" | "desc"; status: "active" | "removed" | "all" }) {
  const c = collections(deps.db);
  const px = p2(deps.db);
  const now = nowOf(deps);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const memberships = await c.memberships.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, ...(q.status === "all" ? {} : { status: q.status }) }).toArray();
  const userIds = [...new Set(memberships.map((m) => m.user_id))];
  const users = await c.users.find({ _id: { $in: userIds.map(toUserKey) } }).toArray();
  const byUser = new Map(users.map((u) => [String(u._id), u]));

  const logAgg = await px.call_logs
    .aggregate<{ _id: string; last: Date; recent: number }>([
      { $match: { org_id: scope.orgId, caller_id: { $in: userIds }, team_id: { $in: scope.teamIds } } },
      { $group: { _id: "$caller_id", last: { $max: { $ifNull: ["$approved_at", "$created_at"] } }, recent: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "approved"] }, { $gte: ["$approved_at", since30] }] }, 1, 0] } } } },
    ])
    .toArray();
  const logs = new Map(logAgg.map((r) => [r._id, r]));
  const fus = await px.follow_ups.find({ org_id: scope.orgId, owner_user_id: { $in: userIds }, status: "open", team_id: { $in: scope.teamIds } }).toArray();
  const openBy = new Map<string, number>();
  const overdueBy = new Map<string, number>();
  for (const f of fus) {
    openBy.set(f.owner_user_id, (openBy.get(f.owner_user_id) ?? 0) + 1);
    if (f.due_date && f.due_date < todayIn(scope.teams.get(f.team_id)?.timezone ?? null, now)) overdueBy.set(f.owner_user_id, (overdueBy.get(f.owner_user_id) ?? 0) + 1);
  }

  const rows = memberships.map((m) => {
    const u = byUser.get(m.user_id);
    const l = logs.get(m.user_id);
    return {
      membership_id: m._id,
      user_id: m.user_id,
      name: u?.display_name ?? u?.name ?? "",
      email: u?.email ?? "",
      role: m.role,
      team_id: m.team_id,
      team: scope.teams.get(m.team_id)?.name ?? "",
      team_focus: scope.teams.get(m.team_id)?.focus ?? "",
      status: m.status,
      joined_at: m.joined_at,
      calls_logged_30d: l?.recent ?? 0,
      follow_ups_open: openBy.get(m.user_id) ?? 0,
      overdue: overdueBy.get(m.user_id) ?? 0,
      last_activity: l?.last ?? null,
    };
  });
  const dir = q.dir === "desc" ? -1 : 1;
  const key = (r: (typeof rows)[number]): string | number =>
    q.sort === "team" ? r.team.toLowerCase() : q.sort === "joined" ? r.joined_at.getTime() : q.sort === "last_activity" ? (r.last_activity?.getTime() ?? 0) : r.name.toLowerCase();
  rows.sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : a.membership_id < b.membership_id ? -1 : 1));
  return { volunteers: rows };
}

const lastWeeks = (now: Date, n: number): string[] => Array.from({ length: n }, (_, i) => weekStart(new Date(now.getTime() - (n - 1 - i) * 7 * 86_400_000)));

/**
 * One volunteer's own series, with the team baseline beside it. Baseline cells under the
 * minimum are suppressed. Warmth ratings: the volunteer's own and the model's are shown
 * separately, never averaged together.
 */
export async function volunteerTrend(deps: Deps, scope: Scope, userId: string, weeks = 12) {
  const c = collections(deps.db);
  const px = p2(deps.db);
  const now = nowOf(deps);
  const member = await c.memberships.findOne({ org_id: scope.orgId, user_id: userId, team_id: { $in: scope.teamIds } });
  if (!member) throw notFound();
  const user = await c.users.findOne({ _id: toUserKey(userId) });
  const teamIds = (await c.memberships.find({ org_id: scope.orgId, user_id: userId, team_id: { $in: scope.teamIds }, status: "active" }).toArray()).map((m) => m.team_id);
  const labels = lastWeeks(now, weeks);
  const from = new Date(`${labels[0]}T00:00:00Z`);

  const mine = await px.call_logs.find({ org_id: scope.orgId, caller_id: userId, team_id: { $in: teamIds }, status: "approved", approved_at: { $gte: from } }).toArray();
  const callsByWeek = new Map<string, number>();
  const editedByWeek = new Map<string, number>();
  for (const l of mine) {
    const w = weekStart(l.approved_at!);
    callsByWeek.set(w, (callsByWeek.get(w) ?? 0) + 1);
    if (JSON.stringify(l.approved) !== JSON.stringify(l.draft)) editedByWeek.set(w, (editedByWeek.get(w) ?? 0) + 1);
  }
  const closed = await px.follow_ups.find({ org_id: scope.orgId, owner_user_id: userId, team_id: { $in: teamIds }, status: "done", closed_at: { $gte: from } }).toArray();
  const closedByWeek = new Map<string, { total: number; onTime: number }>();
  for (const f of closed) {
    const w = weekStart(f.closed_at!);
    const cur = closedByWeek.get(w) ?? { total: 0, onTime: 0 };
    cur.total += 1;
    if (!f.due_date || f.closed_at!.toISOString().slice(0, 10) <= f.due_date) cur.onTime += 1;
    closedByWeek.set(w, cur);
  }

  const series = labels.map((w) => ({
    week: w,
    calls_logged: callsByWeek.get(w) ?? 0,
    follow_ups_closed: closedByWeek.get(w)?.total ?? 0,
    follow_ups_closed_on_time: closedByWeek.get(w)?.onTime ?? 0,
    logs_edited_before_approval: editedByWeek.get(w) ?? 0,
  }));

  // Team baseline: callers on the same teams, all weeks combined, per-week cells suppressed under the minimum.
  const teamLogs = await px.call_logs.find({ org_id: scope.orgId, team_id: { $in: teamIds }, status: "approved", approved_at: { $gte: from } }).toArray();
  const teamCalls = new Map<string, number>();
  const teamCallers = new Map<string, Set<string>>();
  for (const l of teamLogs) {
    const w = weekStart(l.approved_at!);
    teamCalls.set(w, (teamCalls.get(w) ?? 0) + 1);
    (teamCallers.get(w) ?? teamCallers.set(w, new Set()).get(w)!).add(l.caller_id);
  }
  const baseline = labels.map((w) => ({ week: w, calls_logged: cell(teamCalls.get(w) ?? 0), callers: cell(teamCallers.get(w)?.size ?? 0) }));

  const mineWarmth = await px.warmth_ratings.find({ org_id: scope.orgId, caller_id: userId, team_id: { $in: teamIds }, created_at: { $gte: from } }).sort({ created_at: 1 }).toArray();
  const teamWarmth = await px.warmth_ratings.find({ org_id: scope.orgId, team_id: { $in: teamIds }, created_at: { $gte: from } }).toArray();
  const dist = (score: (r: (typeof teamWarmth)[number]) => number | null) =>
    [1, 2, 3, 4, 5].map((s) => ({ score_level: s, ratings: cell(teamWarmth.filter((r) => score(r) === s).length) }));

  // Matched segments: the same donor mix for this volunteer and the team baseline.
  const donors = await c.donors.find({ org_id: scope.orgId, team_ids: { $in: teamIds } }).toArray();
  const gifts = await lastGiftByDonor(deps, scope.orgId);
  const seg = new Map(donors.map((d) => [d._id, donorSegment(d, gifts.get(d._id) ?? null, now)]));
  const matched = DONOR_SEGMENTS.map((s: DonorSegment) => {
    const inSeg = (l: (typeof teamLogs)[number]) => seg.get(l.donor_id) === s;
    const t = teamLogs.filter(inSeg);
    const m = teamLogs.filter((l) => l.caller_id === userId && inSeg(l));
    const reached = (xs: typeof t) => xs.filter((l) => l.approved?.outcome === "reached").length;
    return { segment: s, volunteer: { calls: cell(m.length), reached: cell(reached(m)) }, team: { calls: cell(t.length), reached: cell(reached(t)) } };
  });

  return {
    label: "For discussion with this volunteer, not an evaluation.",
    volunteer: { user_id: userId, name: user?.display_name ?? user?.name ?? "", teams: teamIds.map((t) => scope.teams.get(t)?.name ?? "") },
    weeks: labels,
    series,
    team_baseline: baseline,
    warmth: {
      // Separate series; never averaged together.
      own: mineWarmth.map((r) => ({ at: r.created_at, volunteer_score: r.volunteer_score, model_score: r.llm_score })),
      team_volunteer_ratings: dist((r) => r.volunteer_score),
      team_model_ratings: dist((r) => r.llm_score),
    },
    matched_segments: matched,
    min_cell: MIN_CELL,
  };
}

/** Role changes and removals live in S2's membership routes; reassignment adds a membership on another team. */
export async function reassignVolunteer(deps: Deps, scope: Scope, access: Access, membershipId: string, toTeamId: string) {
  const c = collections(deps.db);
  const m = await c.memberships.findOne({ _id: membershipId, org_id: scope.orgId, team_id: { $in: scope.teamIds } });
  if (!m) throw notFound();
  if (!scope.teamIds.includes(toTeamId)) throw notFound();
  if (m.team_id === toTeamId) throw new HttpError(422, "same_team");
  const { randomUUID } = await import("node:crypto");
  const now = nowOf(deps);
  await c.memberships.updateOne({ user_id: m.user_id, team_id: toTeamId }, { $set: { role: m.role, status: "active", org_id: scope.orgId }, $setOnInsert: { _id: randomUUID(), joined_at: now } }, { upsert: true });
  await c.memberships.updateOne({ _id: m._id }, { $set: { status: "removed" } });
  await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: "membership.reassign", target_type: "membership", target_id: m._id, note: "moved to another team" });
  return { ok: true };
}
