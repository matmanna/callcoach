/**
 * Call activity over time, for the heatmaps. Points go into the `call_activity` time series
 * collection, one per approved call. The heatmap is an aggregation over that collection, grouped by
 * UTC day. Days with fewer than MIN_CELL calls show as "some" rather than a number, the same
 * suppression rule the rest of the insights use.
 */
import { MIN_CELL } from "@sc/shared";
import type { ClientSession } from "mongodb";
import { collections } from "../db/collections.ts";
import type { Deps } from "./context.ts";

export interface ActivityInput {
  orgId: string;
  teamId: string;
  callerId: string;
  at: Date;
  source?: "live" | "demo";
}

/**
 * Records one approved call. Not inside a transaction: time series collections reject inserts in
 * multi-document transactions. Callers run it after the approval commits.
 */
export async function recordActivity(deps: Deps, session: ClientSession | undefined, input: ActivityInput): Promise<void> {
  await collections(deps.db).call_activity.insertOne(
    { at: input.at, meta: { org_id: input.orgId, team_id: input.teamId, caller_id: input.callerId, source: input.source ?? "live" } },
    session ? { session } : undefined,
  );
}

export interface HeatDay {
  date: string;
  /** Exact count when at least MIN_CELL calls; null when hidden. */
  count: number | null;
  /** True when some calls happened but fewer than MIN_CELL. */
  some: boolean;
}

export interface Heatmap {
  from: string;
  to: string;
  total: { suppressed: true } | { n: number };
  days: HeatDay[];
}

const dayString = (d: Date) => d.toISOString().slice(0, 10);

/** Last `days` UTC days, oldest first, including zero-activity days so the grid has no holes. */
export async function activityHeatmap(
  deps: Deps,
  scope: { orgId: string; teamIds?: string[] | null; callerId?: string | null },
  days = 365,
  now: Date = new Date(),
): Promise<Heatmap> {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const match: Record<string, unknown> = { "meta.org_id": scope.orgId, at: { $gte: start, $lte: new Date(end.getTime() + 86_399_999) } };
  if (scope.teamIds) match["meta.team_id"] = { $in: scope.teamIds };
  if (scope.callerId) match["meta.caller_id"] = scope.callerId;

  const rows = await collections(deps.db).call_activity
    .aggregate<{ _id: string; n: number }>([
      { $match: match },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: "UTC" } }, n: { $sum: 1 } } },
    ])
    .toArray();
  const byDay = new Map(rows.map((r) => [r._id, r.n]));

  const out: HeatDay[] = [];
  let total = 0;
  for (let i = 0; i < days; i += 1) {
    const date = dayString(new Date(start.getTime() + i * 86_400_000));
    const n = byDay.get(date) ?? 0;
    total += n;
    out.push({ date, count: n >= MIN_CELL ? n : null, some: n > 0 && n < MIN_CELL });
  }
  return {
    from: dayString(start),
    to: dayString(end),
    total: total >= MIN_CELL ? { n: total } : { suppressed: true },
    days: out,
  };
}
