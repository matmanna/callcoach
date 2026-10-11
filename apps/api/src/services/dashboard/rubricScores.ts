/**
 * A volunteer's rubric results across their approved calls. Results come from the structured log
 * only (see packages/rules rubricEval). Counts under MIN_CELL are suppressed, and the per-call
 * scores are shown only once there are enough scored calls. Nothing here ranks people, and
 * nothing here mixes in the warmth ratings.
 */
import { MIN_CELL, type RubricDoc } from "@sc/shared";
import { evaluateRubric, rubricScore } from "@sc/rules";
import { collections } from "../../db/collections.ts";
import { p2 } from "./p2Docs.ts";
import { cell, type Cell } from "./scope.ts";

export async function orgRubricItems(deps: { db: import("mongodb").Db }, orgId: string): Promise<RubricDoc["items"] | null> {
  const rubric = await collections(deps.db).rubrics.findOne({ org_id: orgId, team_id: null });
  return rubric ? rubric.items : null;
}

/** `teamIds` limits the calls to the teams in scope (coordinators); null means all of the caller's calls. */
export async function volunteerRubric(deps: { db: import("mongodb").Db }, orgId: string, userId: string, teamIds: string[] | null) {
  const items = await orgRubricItems(deps, orgId);
  const filter = { org_id: orgId, caller_id: userId, status: "approved" as const, ...(teamIds ? { team_id: { $in: teamIds } } : {}) };
  const logs = await p2(deps.db).call_logs.find(filter, { projection: { approved: 1 } }).toArray();
  if (!items) return { rubric: false as const, calls: cell(logs.length), scored_calls: cell(0), mean_percent: { suppressed: true } as const, items: [] };

  const counts = items.map((i) => ({ id: i.id, text: i.text, weight: i.weight ?? 1, met: 0, not_met: 0, unknown: 0, n_a: 0 }));
  const percents: number[] = [];
  for (const log of logs) {
    if (!log.approved) continue;
    const results = evaluateRubric(items, log.approved);
    results.forEach((r, idx) => (counts[idx]![r.status] += 1));
    const score = rubricScore(results);
    if (score.percent !== null) percents.push(score.percent);
  }
  const scored = cell(percents.length);
  const mean = percents.length >= MIN_CELL ? Math.round(percents.reduce((s, p) => s + p, 0) / percents.length) : null;
  return {
    rubric: true as const,
    calls: cell(logs.length),
    scored_calls: scored,
    mean_percent: mean === null ? ({ suppressed: true } as const) : mean,
    items: counts.map((c) => ({
      id: c.id,
      text: c.text,
      weight: c.weight,
      met: cell(c.met),
      not_met: cell(c.not_met),
      unknown: cell(c.unknown),
      n_a: cell(c.n_a),
    })) as Array<{ id: string; text: string; weight: number; met: Cell; not_met: Cell; unknown: Cell; n_a: Cell }>,
  };
}
