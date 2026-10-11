/** Calls, coordinator queue, pending limits, follow-ups. Reads P2 collections; applies coordinator decisions. */
import { RED_LABELS } from "@sc/shared";
import type { Access } from "../../auth/access.ts";
import { appendAudit, listAudit } from "../../db/audit.ts";
import { collections } from "../../db/collections.ts";
import { withTx } from "../../db/tx.ts";
import { HttpError, notFound } from "../../http.ts";
import { nowOf, type Deps } from "../context.ts";
import { p2, type FlagRow } from "./p2Docs.ts";
import type { Scope } from "./scope.ts";
import { displayNames, todayIn } from "./util.ts";

const isRed = (l: string) => (RED_LABELS as readonly string[]).includes(l);

function teamToday(scope: Scope, teamId: string, now: Date) {
  return todayIn(scope.teams.get(teamId)?.timezone ?? null, now);
}

// ---------- calls ----------
export async function listCalls(deps: Deps, scope: Scope, q: { cursor: number; limit: number; status?: string | undefined; outcome?: string | undefined; caller_id?: string | undefined }) {
  const px = p2(deps.db);
  const match: Record<string, unknown> = { org_id: scope.orgId, team_id: { $in: scope.teamIds } };
  if (q.status === "draft" || q.status === "approved") match.status = q.status;
  if (q.caller_id) match.caller_id = q.caller_id;
  if (q.outcome) match.$or = [{ "approved.outcome": q.outcome }, { status: "draft", "draft.outcome": q.outcome }];
  const total = await px.call_logs.countDocuments(match);
  const logs = await px.call_logs.find(match).sort({ created_at: -1, _id: 1 }).skip(q.cursor).limit(q.limit).toArray();
  const donors = await collections(deps.db).donors.find({ _id: { $in: logs.map((l) => l.donor_id) } }, { projection: { external_id: 1 } }).toArray();
  const ext = new Map(donors.map((d) => [d._id, d.external_id]));
  const fus = await px.follow_ups.find({ org_id: scope.orgId, created_from_log_id: { $in: logs.map((l) => l._id) } }).toArray();
  const fuByLog = new Map(fus.map((f) => [f.created_from_log_id, f.status]));
  const names = await displayNames(deps, logs.map((l) => l.caller_id));
  return {
    total,
    calls: logs.map((l) => {
      const f = l.approved ?? l.draft;
      return {
        id: l._id,
        date: l.approved_at ?? l.created_at,
        caller: names.get(l.caller_id) ?? "",
        donor_ref: ext.get(l.donor_id) ?? "",
        outcome: f.outcome,
        preference: f.preference,
        follow_up_status: fuByLog.get(l._id) ?? (f.follow_up.needed ? "pending approval" : "none"),
        approval_status: l.status,
        team: scope.teams.get(l.team_id)?.name ?? "",
      };
    }),
    next_cursor: q.cursor + q.limit < total ? String(q.cursor + q.limit) : null,
  };
}

export async function getCall(deps: Deps, scope: Scope, id: string) {
  const px = p2(deps.db);
  const log = await px.call_logs.findOne({ _id: id, org_id: scope.orgId, team_id: { $in: scope.teamIds } });
  if (!log) throw notFound();
  const [donor, warmth, fus, flags, audit] = await Promise.all([
    collections(deps.db).donors.findOne({ _id: log.donor_id }, { projection: { external_id: 1 } }),
    px.warmth_ratings.findOne({ org_id: scope.orgId, call_id: log._id }),
    px.follow_ups.find({ org_id: scope.orgId, created_from_log_id: log._id }).toArray(),
    px.flags.find({ org_id: scope.orgId, log_id: log._id }).toArray(),
    listAudit(deps.db, scope.orgId, { target_id: id }, 50),
  ]);
  const names = await displayNames(deps, [log.caller_id, ...audit.map((a) => a.who), ...fus.map((f) => f.owner_user_id)]);
  return {
    id: log._id,
    donor_ref: donor?.external_id ?? "",
    donor_id: log.donor_id,
    caller: names.get(log.caller_id) ?? "",
    team: scope.teams.get(log.team_id)?.name ?? "",
    status: log.status,
    approved_at: log.approved_at,
    created_at: log.created_at,
    // Fields only. No note text exists anywhere to show.
    approved: log.approved,
    draft_history: { model_draft: log.model_draft, edited_before_approval: !!log.approved && JSON.stringify(log.approved) !== JSON.stringify(log.draft) },
    warmth: warmth
      ? { volunteer_score: warmth.volunteer_score, model_score: warmth.llm_score, model_reason: warmth.llm_reason, gap: warmth.llm_score === null ? null : Math.abs(warmth.volunteer_score - warmth.llm_score) }
      : null,
    follow_ups: fus.map((f) => ({ id: f._id, action: f.action, status: f.status, due_date: f.due_date, owner: names.get(f.owner_user_id) ?? "" })),
    flags: flags.map((f) => ({ id: f._id, label: f.label, status: f.status })),
    audit: audit.map((a) => ({ id: a._id, action: a.action, who: names.get(a.who) ?? "", ts: a.ts, note: a.note })),
  };
}

// ---------- queue ----------
export async function listQueue(deps: Deps, scope: Scope) {
  const px = p2(deps.db);
  const flags = await px.flags.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, status: "proposed" }).sort({ created_at: 1 }).toArray();
  const now = nowOf(deps);
  const ordered = [...flags].sort((a, b) => Number(isRed(b.label)) - Number(isRed(a.label)) || a.created_at.getTime() - b.created_at.getTime());
  const donors = await collections(deps.db).donors.find({ _id: { $in: ordered.map((f) => f.donor_id) } }, { projection: { external_id: 1 } }).toArray();
  const ext = new Map(donors.map((d) => [d._id, d.external_id]));
  return {
    note: "Suggested by rules, needs review.",
    items: ordered.map((f) => ({
      id: f._id,
      label: f.label,
      red: isRed(f.label),
      reason: f.reason,
      log_id: f.log_id,
      donor_id: f.donor_id,
      donor_ref: ext.get(f.donor_id) ?? "",
      team: scope.teams.get(f.team_id)?.name ?? "",
      age_hours: Math.floor((now.getTime() - f.created_at.getTime()) / 3_600_000),
      created_at: f.created_at,
    })),
  };
}

async function flagInScope(deps: Deps, scope: Scope, id: string): Promise<FlagRow> {
  const f = await p2(deps.db).flags.findOne({ _id: id, org_id: scope.orgId, team_id: { $in: scope.teamIds } });
  if (!f) throw notFound();
  return f;
}

const TO_STATUS = { approve: "approved", override: "overridden", resolve: "resolved" } as const;

export async function decideFlag(deps: Deps, scope: Scope, access: Access, id: string, input: { action: "approve" | "override" | "resolve"; note?: string | undefined }) {
  const flag = await flagInScope(deps, scope, id);
  const note = input.note?.trim() || null;
  if (input.action === "override" && !note) throw new HttpError(422, "note_required");
  if (input.action === "resolve" && isRed(flag.label) && !note) throw new HttpError(422, "note_required");
  const allowedFrom = input.action === "resolve" ? ["proposed", "approved"] : ["proposed"];
  if (!allowedFrom.includes(flag.status)) throw new HttpError(409, "already_decided", { status: flag.status });
  const now = nowOf(deps);
  await withTx(deps.client, async (session) => {
    const res = await p2(deps.db).flags.updateOne(
      { _id: flag._id, status: { $in: allowedFrom as FlagRow["status"][] } },
      { $set: { status: TO_STATUS[input.action], decided_by: access.user.id, decided_at: now, decision_note: note } },
      { session },
    );
    if (!res.modifiedCount) throw new HttpError(409, "already_decided");
    // One audit row in the same transaction as the status change.
    await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: `flag.${input.action}`, target_type: "flag", target_id: flag._id, note: [flag.label, note].filter(Boolean).join(": ") }, session);
  });
  return { id: flag._id, status: TO_STATUS[input.action] };
}

/** Batch resolve is allowed only for non-red labels; any red label rejects the whole batch. */
export async function batchResolve(deps: Deps, scope: Scope, access: Access, ids: string[], note?: string) {
  const flags = await p2(deps.db).flags.find({ _id: { $in: ids }, org_id: scope.orgId, team_id: { $in: scope.teamIds } }).toArray();
  if (flags.length !== new Set(ids).size) throw notFound();
  if (flags.some((f) => isRed(f.label))) throw new HttpError(422, "batch_resolve_not_allowed_for_red_labels");
  const now = nowOf(deps);
  await withTx(deps.client, async (session) => {
    for (const f of flags) {
      await p2(deps.db).flags.updateOne({ _id: f._id }, { $set: { status: "resolved", decided_by: access.user.id, decided_at: now, decision_note: note ?? null } }, { session });
      await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: "flag.resolve", target_type: "flag", target_id: f._id, note: [f.label, note].filter(Boolean).join(": ") }, session);
    }
  });
  return { resolved: flags.length };
}

// ---------- pending limits ----------
export async function listPendingLimits(deps: Deps, scope: Scope) {
  const rows = await p2(deps.db).pending_limits.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, status: "pending" }).sort({ created_at: 1 }).toArray();
  const donors = await collections(deps.db).donors.find({ _id: { $in: rows.map((r) => r.donor_id) } }, { projection: { external_id: 1, first_name: 1, last_name: 1 } }).toArray();
  const byId = new Map(donors.map((d) => [d._id, d]));
  return {
    pending_limits: rows.map((r) => ({
      id: r._id,
      limit: r.limit,
      donor_id: r.donor_id,
      donor_ref: byId.get(r.donor_id)?.external_id ?? "",
      donor_name: byId.get(r.donor_id) ? `${byId.get(r.donor_id)!.first_name} ${byId.get(r.donor_id)!.last_name}` : "",
      log_id: r.log_id,
      created_at: r.created_at,
    })),
  };
}

// ---------- follow-ups ----------
export async function listFollowUps(deps: Deps, scope: Scope, q: { status?: string | undefined; overdue?: boolean | undefined; owner_id?: string | undefined }) {
  const px = p2(deps.db);
  const match: Record<string, unknown> = { org_id: scope.orgId, team_id: { $in: scope.teamIds } };
  if (q.status) match.status = q.status;
  if (q.owner_id) match.owner_user_id = q.owner_id;
  const rows = await px.follow_ups.find(match).sort({ due_date: 1, created_at: 1 }).limit(500).toArray();
  const now = nowOf(deps);
  const names = await displayNames(deps, rows.map((r) => r.owner_user_id));
  const donors = await collections(deps.db).donors.find({ _id: { $in: rows.map((r) => r.donor_id) } }, { projection: { external_id: 1 } }).toArray();
  const ext = new Map(donors.map((d) => [d._id, d.external_id]));
  const items = rows.map((r) => ({
    id: r._id,
    action: r.action,
    due_date: r.due_date,
    status: r.status,
    owner: names.get(r.owner_user_id) ?? "",
    donor_ref: ext.get(r.donor_id) ?? "",
    team: scope.teams.get(r.team_id)?.name ?? "",
    overdue: r.status === "open" && !!r.due_date && r.due_date < teamToday(scope, r.team_id, now),
    handed_off: r.status === "handed_off",
    note: r.last_note,
  }));
  return { follow_ups: q.overdue ? items.filter((i) => i.overdue) : items };
}
