import { RED_LABELS } from "@sc/shared";
import { collections } from "../../db/collections.ts";
import { nowOf, type Deps } from "../context.ts";
import { isStale, staleDays } from "./facts.ts";
import { p2 } from "./p2Docs.ts";
import { weekStart, type Scope } from "./scope.ts";
import { todayIn } from "./util.ts";

/** Operational counts for the coordinator's to-do list. Model output is labelled as such. */
export async function overview(deps: Deps, scope: Scope) {
  const px = p2(deps.db);
  const c = collections(deps.db);
  const now = nowOf(deps);
  const weekFrom = new Date(`${weekStart(now)}T00:00:00Z`);
  const teamMatch = { org_id: scope.orgId, team_id: { $in: scope.teamIds } };

  const weekLogs = await px.call_logs.find({ ...teamMatch, created_at: { $gte: weekFrom } }, { projection: { status: 1 } }).toArray();
  const flags = await px.flags.find({ ...teamMatch, status: "proposed" }).toArray();
  const byLabel: Record<string, number> = Object.fromEntries(RED_LABELS.map((l) => [l, 0]));
  for (const f of flags) byLabel[f.label] = (byLabel[f.label] ?? 0) + 1;
  const oldest = flags.reduce<Date | null>((m, f) => (!m || f.created_at < m ? f.created_at : m), null);

  const open = await px.follow_ups.find({ ...teamMatch, status: "open" }).toArray();
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10);
  let overdue = 0;
  let dueThisWeek = 0;
  for (const f of open) {
    const today = todayIn(scope.teams.get(f.team_id)?.timezone ?? null, now);
    if (f.due_date && f.due_date < today) overdue += 1;
    else if (f.due_date && f.due_date <= inDays(7)) dueThisWeek += 1;
  }

  const sheets = await c.fact_sheets.find({ org_id: scope.orgId }).toArray();
  const days = staleDays(deps);
  let approved = 0;
  let draft = 0;
  let stale = 0;
  for (const s of sheets)
    for (const i of s.items) {
      if (i.status === "draft") draft += 1;
      else if (isStale(i.verified_on, now, days)) stale += 1;
      else approved += 1;
    }

  return {
    suggested_note: "Flags are suggested by rules and need review. Model ratings, where shown, are suggestions too.",
    scope: { team_id: scope.teamId, team_count: scope.teamIds.length },
    calls_this_week: { completed: weekLogs.length, approved: weekLogs.filter((l) => l.status === "approved").length, pending_approval: weekLogs.filter((l) => l.status === "draft").length },
    queue: { open: flags.length, by_label: byLabel, oldest_age_hours: oldest ? Math.floor((now.getTime() - oldest.getTime()) / 3_600_000) : null },
    follow_ups: { open: open.length, overdue, due_this_week: dueThisWeek },
    escalations: { awaiting_decision: (byLabel.DISTRESS ?? 0) + (byLabel.STOP_CONTACT ?? 0) },
    fact_sheet_health: { approved, draft, stale },
  };
}

export async function teamsPanel(deps: Deps, scope: Scope) {
  const c = collections(deps.db);
  const px = p2(deps.db);
  const now = nowOf(deps);
  const members = await c.memberships.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, status: "active" }).toArray();
  const open = await px.follow_ups.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, status: "open" }).toArray();
  const packets = await c.handoff_packets.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, status: "open" }).toArray();
  return {
    teams: scope.teamIds.map((id) => {
      const t = scope.teams.get(id)!;
      const fus = open.filter((f) => f.team_id === id);
      const today = todayIn(t.timezone ?? null, now);
      return {
        id,
        name: t.name,
        focus: t.focus,
        parent_team_id: t.parent_team_id,
        members: members.filter((m) => m.team_id === id).length,
        active_callers: members.filter((m) => m.team_id === id && m.role === "caller").length,
        open_follow_ups: fus.length,
        overdue: fus.filter((f) => f.due_date && f.due_date < today).length,
        handoff_packets_pending: packets.filter((p) => p.team_id === id).length,
      };
    }),
  };
}
