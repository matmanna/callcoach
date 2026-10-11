/**
 * Insights. Every cell under MIN_CELL is suppressed on the server: a suppressed cell is
 * `{ suppressed: true }` and carries no number. Group totals are emitted only when no cell in
 * the group is suppressed, so a total cannot be subtracted to reveal a hidden cell. Views
 * compare segments and time, never people. Language is about calls and follow-ups only.
 */
import { DONOR_SEGMENTS, type DonorSegment } from "@sc/shared";
import { collections } from "../../db/collections.ts";
import { HttpError } from "../../http.ts";
import { toUserKey } from "../orgs.ts";
import { nowOf, type Deps } from "../context.ts";
import { donorSegment, lastGiftByDonor } from "./contacts.ts";
import { p2, type CallLogRow, type FollowUpRow } from "./p2Docs.ts";
import { cell, isShown, parseRange, weekStart, type Cell, type Scope } from "./scope.ts";

const OUTCOMES = ["reached", "voicemail", "no_answer", "declined", "rescheduled"] as const;
const PREFERENCES = ["stop_calls", "email_preferred", "call_later"] as const;
const BANDS = ["00-03", "03-06", "06-09", "09-12", "12-15", "15-18", "18-21", "21-24"] as const;

/** Total shown only when every cell in the group is shown. */
function safeTotal(cells: Cell[], total: number): Cell {
  return cells.every(isShown) ? cell(total) : { suppressed: true };
}

interface Ctx {
  scope: Scope;
  range: ReturnType<typeof parseRange>;
  logs: CallLogRow[];
  donors: Map<string, { campaign: string; region: string | null; segment: DonorSegment }>;
  callerTz: Map<string, string>;
}

async function context(deps: Deps, scope: Scope, from?: string, to?: string): Promise<Ctx> {
  const now = nowOf(deps);
  const range = parseRange(from, to, now);
  const c = collections(deps.db);
  const logs = await p2(deps.db).call_logs.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, status: "approved", approved_at: { $gte: range.from, $lte: range.to } }).toArray();
  const donorDocs = await c.donors.find({ org_id: scope.orgId, team_ids: { $in: scope.teamIds } }).toArray();
  const gifts = await lastGiftByDonor(deps, scope.orgId);
  const donors = new Map(donorDocs.map((d) => [d._id, { campaign: d.campaign, region: d.region ?? null, segment: donorSegment(d, gifts.get(d._id) ?? null, now) }]));
  const callerIds = [...new Set(logs.map((l) => l.caller_id))];
  const users = callerIds.length ? await c.users.find({ _id: { $in: callerIds.map(toUserKey) } }).toArray() : [];
  return { scope, range, logs, donors, callerTz: new Map(users.map((u) => [String(u._id), u.timezone ?? "UTC"])) };
}

/** Donor mix beside every figure, so segment differences are not mistaken for caller effects. */
function donorMix(ctx: Ctx, logs: CallLogRow[]) {
  const seen = new Map<string, DonorSegment>();
  for (const l of logs) {
    const d = ctx.donors.get(l.donor_id);
    if (d) seen.set(l.donor_id, d.segment);
  }
  return Object.fromEntries(DONOR_SEGMENTS.map((s) => [s, cell([...seen.values()].filter((x) => x === s).length)])) as Record<DonorSegment, Cell>;
}

const meta = (ctx: Ctx, denominator: number, mix: Record<DonorSegment, Cell>, what: string) => ({
  team_id: ctx.scope.teamId,
  range: { from: ctx.range.fromStr, to: ctx.range.toStr },
  denominator: { what, count: cell(denominator) },
  donor_mix: mix,
  note: "Counts under 5 are suppressed. This describes calls and follow-ups only.",
});

const bandOf = (d: Date, tz: string): string => {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d));
  } catch {
    hour = d.getUTCHours();
  }
  return BANDS[Math.min(7, Math.floor(hour / 3))]!;
};

export const CHART_KINDS = ["calls_per_week", "follow_up_completion", "preference_reports", "overdue_trend", "warmth_distribution", "time_bands"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export async function chart(deps: Deps, scope: Scope, kind: ChartKind, from?: string, to?: string, opts: { splitByTeam?: boolean } = {}) {
  const ctx = await context(deps, scope, from, to);
  const px = p2(deps.db);
  const now = nowOf(deps);

  if (kind === "calls_per_week") {
    const keys = new Map<string, CallLogRow[]>();
    for (const l of ctx.logs) {
      // Aggregated across the teams in scope unless a split is requested (fewer small cells to suppress).
      const k = `${weekStart(l.approved_at!)}|${opts.splitByTeam ? l.team_id : "all"}`;
      (keys.get(k) ?? keys.set(k, []).get(k)!).push(l);
    }
    const rows = [...keys.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, ls]) => {
        const [week, teamId] = k.split("|") as [string, string];
        const cells = OUTCOMES.map((o) => cell(ls.filter((l) => l.approved!.outcome === o).length));
        return { week, team_id: teamId === "all" ? null : teamId, team: teamId === "all" ? "All teams in scope" : (scope.teams.get(teamId)?.name ?? ""), outcomes: Object.fromEntries(OUTCOMES.map((o, i) => [o, cells[i]!])), total: safeTotal(cells, ls.length) };
      });
    return { kind, ...meta(ctx, ctx.logs.length, donorMix(ctx, ctx.logs), "approved call logs"), outcomes: OUTCOMES, rows };
  }

  if (kind === "follow_up_completion") {
    const fus = await px.follow_ups.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, created_at: { $gte: ctx.range.from, $lte: ctx.range.to } }).toArray();
    const byWeek = new Map<string, FollowUpRow[]>();
    for (const f of fus) (byWeek.get(weekStart(f.created_at)) ?? byWeek.set(weekStart(f.created_at), []).get(weekStart(f.created_at))!).push(f);
    const rows = [...byWeek.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([week, fs]) => {
        const created = cell(fs.length);
        const done = fs.filter((f) => f.status === "done" && f.closed_at);
        const closed = cell(done.length);
        const days = done.map((f) => (f.closed_at!.getTime() - f.created_at.getTime()) / 86_400_000).sort((a, b) => a - b);
        const median = days.length >= 5 ? days[Math.floor(days.length / 2)]! : null;
        return {
          week,
          created,
          completed: closed,
          // Rate shown only when both its numerator and denominator are shown.
          completion_rate: isShown(created) && isShown(closed) ? Math.round((closed.n / created.n) * 100) : ({ suppressed: true } as const),
          median_days_to_close: median === null ? ({ suppressed: true } as const) : Math.round(median * 10) / 10,
        };
      });
    return { kind, ...meta(ctx, fus.length, donorMix(ctx, ctx.logs), "follow-ups created in range"), rows };
  }

  if (kind === "preference_reports") {
    const byCampaign = new Map<string, CallLogRow[]>();
    for (const l of ctx.logs) {
      const camp = ctx.donors.get(l.donor_id)?.campaign ?? "unknown";
      (byCampaign.get(camp) ?? byCampaign.set(camp, []).get(camp)!).push(l);
    }
    const rows = [...byCampaign.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([campaign, ls]) => {
        const cells = PREFERENCES.map((p) => cell(ls.filter((l) => l.approved!.preference === p).length));
        const logsCell = cell(ls.length);
        return { campaign, logs: logsCell, preferences: Object.fromEntries(PREFERENCES.map((p, i) => [p, cells[i]!])) };
      });
    return { kind, ...meta(ctx, ctx.logs.length, donorMix(ctx, ctx.logs), "approved call logs"), preferences: PREFERENCES, rows };
  }

  if (kind === "overdue_trend") {
    const fus = await px.follow_ups.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, created_at: { $lte: ctx.range.to } }).toArray();
    const weeks: string[] = [];
    for (let t = new Date(`${weekStart(ctx.range.from)}T00:00:00Z`).getTime(); t <= ctx.range.to.getTime(); t += 7 * 86_400_000) weeks.push(new Date(t).toISOString().slice(0, 10));
    const rows = weeks.map((w) => {
      const end = new Date(new Date(`${w}T00:00:00Z`).getTime() + 6 * 86_400_000);
      const endStr = end.toISOString().slice(0, 10);
      const overdue = fus.filter((f) => f.created_at <= end && f.due_date && f.due_date < endStr && (!f.closed_at || f.closed_at > end)).length;
      return { week: w, overdue: cell(overdue) };
    });
    return { kind, ...meta(ctx, fus.length, donorMix(ctx, ctx.logs), "follow-ups created by end of range"), rows };
  }

  if (kind === "warmth_distribution") {
    const ratings = await px.warmth_ratings.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, created_at: { $gte: ctx.range.from, $lte: ctx.range.to } }).toArray();
    const logById = new Map((await px.call_logs.find({ _id: { $in: ratings.map((r) => r.call_id) } }, { projection: { donor_id: 1 } }).toArray()).map((l) => [l._id, l.donor_id]));
    const byCampaign = new Map<string, typeof ratings>();
    for (const r of ratings) {
      const camp = ctx.donors.get(logById.get(r.call_id) ?? "")?.campaign ?? "unknown";
      (byCampaign.get(camp) ?? byCampaign.set(camp, []).get(camp)!).push(r);
    }
    // Team level only: two separate distributions (caller's and model's), never averaged together.
    const levels = [1, 2, 3, 4, 5];
    const rows = [...byCampaign.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([campaign, rs]) => ({
      campaign,
      ratings: cell(rs.length),
      caller_ratings: levels.map((s) => ({ level: s, count: cell(rs.filter((r) => r.volunteer_score === s).length) })),
      model_ratings: levels.map((s) => ({ level: s, count: cell(rs.filter((r) => r.llm_score === s).length) })),
    }));
    return { kind, ...meta(ctx, ratings.length, donorMix(ctx, ctx.logs), "warmth ratings in range"), rows };
  }

  // time_bands: calls completed by 3-hour band in the caller's local time.
  const counts = new Map<string, number>();
  for (const l of ctx.logs) {
    const b = bandOf(l.approved_at!, ctx.callerTz.get(l.caller_id) ?? "UTC");
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const cells = BANDS.map((b) => cell(counts.get(b) ?? 0));
  return {
    kind,
    ...meta(ctx, ctx.logs.length, donorMix(ctx, ctx.logs), "approved call logs"),
    rows: BANDS.map((b, i) => ({ band: b, calls: cells[i]! })),
    total: safeTotal(cells, ctx.logs.length),
  };
}

const country = (region: string) => region.split("-")[0]!;

export async function map(deps: Deps, scope: Scope, level: "region" | "country", from?: string, to?: string) {
  const ctx = await context(deps, scope, from, to);
  const px = p2(deps.db);
  const key = (r: string | null) => (!r ? "unknown" : level === "country" ? country(r) : r);
  const calledBy = new Map<string, Set<string>>();
  for (const l of ctx.logs) {
    const k = key(ctx.donors.get(l.donor_id)?.region ?? null);
    (calledBy.get(k) ?? calledBy.set(k, new Set()).get(k)!).add(l.donor_id);
  }
  const fus = await px.follow_ups.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, created_at: { $gte: ctx.range.from, $lte: ctx.range.to } }).toArray();
  const fuBy = new Map<string, number>();
  for (const f of fus) {
    const k = key(ctx.donors.get(f.donor_id)?.region ?? null);
    fuBy.set(k, (fuBy.get(k) ?? 0) + 1);
  }
  const regions = [...new Set([...calledBy.keys(), ...fuBy.keys()])].sort();
  // Team coverage: which regions each team's callers cover.
  const teamCoverage = scope.teamIds.map((tid) => {
    const by = new Map<string, Set<string>>();
    for (const l of ctx.logs.filter((x) => x.team_id === tid)) {
      const k = key(ctx.donors.get(l.donor_id)?.region ?? null);
      (by.get(k) ?? by.set(k, new Set()).get(k)!).add(l.donor_id);
    }
    return { team_id: tid, team: scope.teams.get(tid)?.name ?? "", regions: [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([region, ds]) => ({ region, donors_called: cell(ds.size) })) };
  });
  return {
    ...meta(ctx, new Set(ctx.logs.map((l) => l.donor_id)).size, donorMix(ctx, ctx.logs), "donors called in range"),
    level,
    // Region level only: no pins, no coordinates, no street-level points.
    regions: regions.map((r) => ({ region: r, donors_called: cell(calledBy.get(r)?.size ?? 0), follow_ups: cell(fuBy.get(r) ?? 0) })),
    team_coverage: teamCoverage,
  };
}

export const COMPARE_KINDS = ["campaign", "time_band", "team"] as const;

export async function compare(deps: Deps, scope: Scope, kind: (typeof COMPARE_KINDS)[number], a: string, b: string, from?: string, to?: string) {
  if (!a || !b || a === b) throw new HttpError(400, "two_different_segments_required");
  const ctx = await context(deps, scope, from, to);
  const select = (v: string) =>
    ctx.logs.filter((l) => (kind === "campaign" ? ctx.donors.get(l.donor_id)?.campaign === v : kind === "team" ? l.team_id === v : bandOf(l.approved_at!, ctx.callerTz.get(l.caller_id) ?? "UTC") === v));
  const seg = (v: string) => {
    const ls = select(v);
    const cells = OUTCOMES.map((o) => cell(ls.filter((l) => l.approved!.outcome === o).length));
    return { segment: v, calls: cell(ls.length), outcomes: Object.fromEntries(OUTCOMES.map((o, i) => [o, cells[i]!])), total: safeTotal(cells, ls.length), donor_mix: donorMix(ctx, ls) };
  };
  if (kind === "team" && (!scope.teamIds.includes(a) || !scope.teamIds.includes(b))) throw new HttpError(404, "not_found");
  return { kind, ...meta(ctx, ctx.logs.length, donorMix(ctx, ctx.logs), "approved call logs"), segments: [seg(a), seg(b)], outcomes: OUTCOMES };
}

export async function campaignsOverview(deps: Deps, scope: Scope, from?: string, to?: string) {
  const ctx = await context(deps, scope, from, to);
  const c = collections(deps.db);
  const camps = await c.campaigns.find({ org_id: scope.orgId }).sort({ name: 1 }).toArray();
  const donorCount = new Map<string, number>();
  for (const d of ctx.donors.values()) donorCount.set(d.campaign, (donorCount.get(d.campaign) ?? 0) + 1);
  return {
    ...meta(ctx, ctx.logs.length, donorMix(ctx, ctx.logs), "approved call logs"),
    campaigns: camps.map((cp) => {
      const ls = ctx.logs.filter((l) => ctx.donors.get(l.donor_id)?.campaign === cp.name);
      return { id: cp._id, name: cp.name, donors: cell(donorCount.get(cp.name) ?? 0), calls: cell(ls.length), donor_mix: donorMix(ctx, ls) };
    }),
  };
}

