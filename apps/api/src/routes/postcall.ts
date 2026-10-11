import { changeLimit } from "../services/dashboard/limits.ts";
import { recordActivity } from "../services/activity.ts";
import {
  ApproveLogPayload,
  DecisionBody,
  FollowUpAction,
  HandoffBody,
  WarmthSubmit,
  WARMTH_DISCUSS_GAP,
  WARMTH_DISCUSS_PROMPT,
  type FollowUpDoc,
  type FollowUpStatus,
  type WarmthDoc,
  type CallLogDoc,
} from "@sc/shared";
import { Hono } from "hono";
import { isOverdue } from "@sc/rules";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireOrg, requireRole, type Access } from "../auth/access.ts";
import { appendAudit } from "../db/audit.ts";
import { collections } from "../db/collections.ts";
import { withTx } from "../db/tx.ts";
import { HttpError, jsonBody, notFound, parseBody } from "../http.ts";
import { accessibleDonor, donorBrief } from "../services/brief.ts";
import { nowOf, type Deps } from "../services/context.ts";
import { modelWarmth } from "../services/postcallModel.ts";
import { orgModelContext } from "../services/orgContext.ts";
import { assertNoPii, assertNoPiiText } from "../services/postcallGuard.ts";
import { toUserKey } from "../services/orgs.ts";
import { teamTimezone } from "../services/teamTimezone.ts";

type Env = { Variables: { access: Access } };

function isCoordinator(access: Access, teamId: string): boolean {
  return access.roles.get(teamId) === "coordinator" && access.user.user_type === "coordinator";
}

async function visibleLog(deps: Deps, access: Access, id: string) {
  const orgId = requireOrg(access);
  const log = await collections(deps.db).call_logs.findOne({ _id: id, org_id: orgId });
  if (!log) throw notFound();
  requireRole(access, log.team_id, "caller");
  if (log.caller_id !== access.user.id && !isCoordinator(access, log.team_id)) throw notFound();
  return log;
}

async function visibleFollowUp(deps: Deps, access: Access, id: string) {
  const orgId = requireOrg(access);
  const followUp = await collections(deps.db).follow_ups.findOne({ _id: id, org_id: orgId });
  if (!followUp) throw notFound();
  requireRole(access, followUp.team_id, "caller");
  if (followUp.owner_user_id !== access.user.id && !isCoordinator(access, followUp.team_id)) throw notFound();
  return followUp;
}

function followUpView(fu: FollowUpDoc, timezone: string, now: Date) {
  return { ...fu, overdue: (fu.status === "open" || fu.status === "handed_off") && isOverdue(fu.due_date, now, timezone) };
}

function ratingView(rating: WarmthDoc) {
  const gap = rating.llm_score === null ? null : Math.abs(rating.volunteer_score - rating.llm_score);
  return { ...rating, gap, discussion_prompt: gap !== null && gap >= WARMTH_DISCUSS_GAP ? WARMTH_DISCUSS_PROMPT : null };
}

async function decideFlag(deps: Deps, access: Access, id: string, action: "approve" | "override" | "resolve", note: string | null) {
  const c = collections(deps.db);
  const orgId = requireOrg(access);
  const flag = await c.call_flags.findOne({ _id: id, org_id: orgId });
  if (!flag) throw notFound();
  requireRole(access, flag.team_id, "coordinator");
  if (action === "override" && !note) throw new HttpError(400, "note_required");
  const donor = await c.donors.findOne({ _id: flag.donor_id, org_id: orgId });
  if (!donor) throw notFound();
  if (note) assertNoPiiText(note, donor, access.user.name);
  const status = action === "approve" ? "approved" : action === "override" ? "overridden" : "resolved";
  if (flag.status === status) return flag;
  if (action !== "resolve" && flag.status !== "proposed") throw new HttpError(409, "flag_already_decided");
  if (action === "resolve" && flag.status === "resolved") return flag;
  const now = nowOf(deps);
  await withTx(deps.client, async (session) => {
    const updated = await c.call_flags.updateOne({ _id: id, org_id: orgId, status: flag.status }, { $set: { status, decided_by: access.user.id, decided_at: now, decision_note: note } }, { session });
    if (!updated.modifiedCount) throw new HttpError(409, "flag_already_decided");
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: `flag.${action}`, target_type: "call_flag", target_id: id, note }, session);
  });
  return c.call_flags.findOne({ _id: id, org_id: orgId });
}

async function decideLimit(deps: Deps, access: Access, id: string, action: "approve" | "reject") {
  const c = collections(deps.db);
  const orgId = requireOrg(access);
  const pending = await c.pending_limits.findOne({ _id: id, org_id: orgId });
  if (!pending) throw notFound();
  requireRole(access, pending.team_id, "coordinator");
  if (pending.status !== "pending") {
    if (pending.status === (action === "approve" ? "approved" : "rejected")) return pending;
    throw new HttpError(409, "limit_already_decided");
  }
  const now = nowOf(deps);
  await withTx(deps.client, async (session) => {
    const updated = await c.pending_limits.updateOne({ _id: id, org_id: orgId, status: "pending" }, { $set: { status: action === "approve" ? "approved" : "rejected", decided_by: access.user.id, decided_at: now } }, { session });
    if (!updated.modifiedCount) throw new HttpError(409, "limit_already_decided");
    if (action === "approve") {
      // Versioned dossier limit (K3): keeps history and mirrors the active limits onto donors.limits.
      const donor = await c.donors.findOne({ _id: pending.donor_id, org_id: orgId }, { session });
      if (!donor) throw notFound();
      const log = await c.call_logs.findOne({ _id: pending.log_id, org_id: orgId }, { session });
      await changeLimit(deps, orgId, donor, access.user.id, { action: "add", value: pending.limit, source: "Donor request (approved call log)", stated_on: (log?.approved_at ?? pending.created_at).toISOString().slice(0, 10) }, "limit", session);
    }
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: `limit.${action}`, target_type: "pending_limit", target_id: id }, session);
  });
  return c.pending_limits.findOne({ _id: id, org_id: orgId });
}

async function changeFollowUp(deps: Deps, access: Access, id: string, action: "complete" | "handoff" | "cancel", body: { idempotency_key: string; note?: string; to_user_id?: string }) {
  const c = collections(deps.db);
  const orgId = requireOrg(access);
  const fu = await c.follow_ups.findOne({ _id: id, org_id: orgId });
  if (!fu) throw notFound();
  requireRole(access, fu.team_id, "caller");
  const prior = fu.action_results?.find((r) => r.key === body.idempotency_key);
  if (prior && prior.actor_user_id === access.user.id) return prior;
  if (action === "cancel") requireRole(access, fu.team_id, "coordinator");
  else if (fu.owner_user_id !== access.user.id && !isCoordinator(access, fu.team_id)) throw notFound();
  if (fu.status !== "open" && fu.status !== "handed_off") throw new HttpError(409, "follow_up_closed");
  if ((action === "handoff" || action === "cancel") && !body.note) throw new HttpError(400, "note_required");
  if (body.note) {
    const donor = await c.donors.findOne({ _id: fu.donor_id, org_id: fu.org_id });
    if (!donor) throw notFound();
    assertNoPiiText(body.note, donor, access.user.name);
  }
  if (action === "handoff") {
    const member = await c.memberships.findOne({ org_id: fu.org_id, team_id: fu.team_id, user_id: body.to_user_id, status: "active" });
    if (!member || body.to_user_id === fu.owner_user_id) throw new HttpError(422, "invalid_handoff_member");
  }
  const status: FollowUpStatus = action === "complete" ? "done" : action === "handoff" ? "handed_off" : "cancelled";
  const now = nowOf(deps);
  const result = { key: body.idempotency_key, actor_user_id: access.user.id, status, owner_user_id: action === "handoff" ? body.to_user_id! : fu.owner_user_id, closed_at: action === "handoff" ? null : now };
  try { await withTx(deps.client, async (session) => {
    const updated = await c.follow_ups.updateOne(
      { _id: id, org_id: fu.org_id, status: fu.status, action_keys: { $ne: body.idempotency_key } },
      { $set: { status, owner_user_id: result.owner_user_id, closed_at: result.closed_at, last_note: body.note ?? null }, $push: { action_keys: body.idempotency_key, action_results: result } },
      { session },
    );
    if (!updated.modifiedCount) throw new HttpError(409, "follow_up_changed");
    await appendAudit(deps.db, { org_id: fu.org_id, who: access.user.id, action: `follow_up.${action}`, target_type: "follow_up", target_id: id, note: body.note ?? null }, session);
  }); } catch (err) {
    const retry = await c.follow_ups.findOne({ _id: id, org_id: fu.org_id });
    const applied = retry?.action_results?.find((r) => r.key === body.idempotency_key && r.actor_user_id === access.user.id);
    if (applied) return applied;
    throw err;
  }
  return result;
}

export function postCallRoutes(deps: Deps) {
  const api = new Hono<Env>();

  api.get("/teams/:id/handoff-members", async (c) => {
    const access = c.get("access");
    const orgId = requireOrg(access);
    const teamId = c.req.param("id");
    requireRole(access, teamId, "caller");
    const cdb = collections(deps.db);
    const memberships = await cdb.memberships.find({ org_id: orgId, team_id: teamId, status: "active" }).toArray();
    const users = await cdb.users.find({ _id: { $in: memberships.map((m) => toUserKey(m.user_id)) } }).toArray();
    return c.json({ members: users.map((u) => ({ user_id: String(u._id), name: u.display_name ?? u.name })) });
  });

  api.get("/donors/:id/brief", async (c) => c.json(await donorBrief(deps, c.get("access"), c.req.param("id"))));

  /** Reserve an empty call log before writing a note. No call content is sent or stored. */
  api.post("/donors/:id/logs/start", async (c) => {
    const body = parseBody(z.strictObject({ call_id: z.uuid(), corrects_log_id: z.uuid().optional() }), await jsonBody(c));
    const access = c.get("access");
    const { donor, teamId, orgId } = await accessibleDonor(deps, access, c.req.param("id"));
    const cdb = collections(deps.db);
    const prior = await cdb.call_logs.findOne({ _id: body.call_id, org_id: orgId });
    if (prior) {
      if (prior.donor_id === donor._id && prior.caller_id === access.user.id) return c.json({ log_id: prior._id });
      throw new HttpError(409, "call_id_used");
    }
    if (body.corrects_log_id) {
      const previous = await cdb.call_logs.findOne({ _id: body.corrects_log_id, org_id: orgId, donor_id: donor._id, caller_id: access.user.id, status: "approved" });
      if (!previous) throw notFound();
    }
    const draft: CallLogDoc = {
      _id: body.call_id, org_id: orgId, team_id: teamId, donor_id: donor._id, caller_id: access.user.id,
      status: "draft", draft: { outcome: "reached", donor_stated_reason: "", preference: "none", follow_up: { needed: false, action: "", due_date: null }, flags: [] },
      model_draft: "disabled", redaction_counts: {}, approved: null, approved_at: null, idempotency_key: null,
      corrects_log_id: body.corrects_log_id ?? null, created_at: nowOf(deps),
    };
    try { await cdb.call_logs.insertOne(draft); }
    catch (err) {
      const retry = await cdb.call_logs.findOne({ _id: body.call_id, org_id: orgId });
      if (retry?.donor_id === donor._id && retry.caller_id === access.user.id) return c.json({ log_id: retry._id });
      throw err;
    }
    return c.json({ log_id: draft._id }, 201);
  });

  api.get("/logs/:id", async (c) => {
    const log = await visibleLog(deps, c.get("access"), c.req.param("id"));
    return c.json({ log: { ...log, draft: log.status === "approved" ? null : log.draft } });
  });

  api.post("/logs/:id/approve", async (c) => {
    const body = parseBody(ApproveLogPayload, await jsonBody(c));
    const access = c.get("access");
    const log = await visibleLog(deps, access, c.req.param("id"));
    if (log.caller_id !== access.user.id) throw notFound();
    if (log.status === "approved") {
      if (log.idempotency_key === body.idempotency_key) return c.json({ log });
      throw new HttpError(409, "log_already_approved");
    }
    const cdb = collections(deps.db);
    if (await cdb.call_logs.findOne({ org_id: log.org_id, caller_id: access.user.id, idempotency_key: body.idempotency_key })) throw new HttpError(409, "idempotency_key_used");
    const donor = await cdb.donors.findOne({ _id: log.donor_id, org_id: log.org_id });
    if (!donor) throw notFound();
    assertNoPii(body.fields, donor, access.user.name);
    const now = nowOf(deps);
    try { await withTx(deps.client, async (session) => {
      const updated = await cdb.call_logs.updateOne(
        { _id: log._id, org_id: log.org_id, status: "draft" },
        { $set: { status: "approved", approved: body.fields, approved_at: now, idempotency_key: body.idempotency_key } },
        { session },
      );
      if (!updated.modifiedCount) throw new HttpError(409, "log_already_approved");
      for (const label of [...new Set(body.fields.flags)]) {
        await cdb.call_flags.insertOne({ _id: randomUUID(), org_id: log.org_id, team_id: log.team_id, donor_id: log.donor_id, log_id: log._id, label, reason: `Structured log flagged ${label.toLowerCase().replaceAll("_", " ")}`, status: "proposed", created_at: now, decided_by: null, decided_at: null, decision_note: null }, { session });
      }
      if (body.fields.preference === "stop_calls" || body.fields.flags.includes("STOP_CONTACT")) {
        await cdb.pending_limits.insertOne({ _id: randomUUID(), org_id: log.org_id, team_id: log.team_id, donor_id: log.donor_id, log_id: log._id, limit: "Do not call", status: "pending", created_at: now, decided_by: null, decided_at: null }, { session });
      }
      if (body.fields.follow_up.needed) {
        const fu: FollowUpDoc = { _id: randomUUID(), org_id: log.org_id, donor_id: log.donor_id, team_id: log.team_id, owner_user_id: log.caller_id, action: body.fields.follow_up.action, due_date: body.fields.follow_up.due_date, status: "open", created_from_log_id: log._id, created_at: now, closed_at: null, action_keys: [], action_results: [], last_note: null };
        await cdb.follow_ups.insertOne(fu, { session });
      }
      await appendAudit(deps.db, { org_id: log.org_id, who: access.user.id, action: "log.approve", target_type: "call_log", target_id: log._id }, session);
    }); } catch (err) {
      const retry = await cdb.call_logs.findOne({ _id: log._id, org_id: log.org_id });
      if (retry?.status === "approved" && retry.idempotency_key === body.idempotency_key) return c.json({ log: retry });
      throw err;
    }
    // Time series collections cannot take inserts inside a multi-document transaction, so the activity
    // point follows the commit. Approval is idempotent, so this runs once per approved log.
    await recordActivity(deps, undefined as never, { orgId: log.org_id, teamId: log.team_id, callerId: log.caller_id, at: now });
    return c.json({ log: await cdb.call_logs.findOne({ _id: log._id, org_id: log.org_id }) });
  });

  api.get("/logs/:id/warmth", async (c) => {
    const access = c.get("access");
    const log = await visibleLog(deps, access, c.req.param("id"));
    const rating = await collections(deps.db).warmth_ratings.findOne({ org_id: log.org_id, call_id: log._id });
    if (!rating) throw notFound();
    if (rating.caller_id !== access.user.id && !isCoordinator(access, rating.team_id)) throw notFound();
    return c.json({ warmth: ratingView(rating) });
  });

  api.post("/logs/:id/warmth", async (c) => {
    const body = parseBody(WarmthSubmit, await jsonBody(c));
    const access = c.get("access");
    const log = await visibleLog(deps, access, c.req.param("id"));
    if (log.caller_id !== access.user.id) throw notFound();
    if (log.status !== "approved" || !log.approved) throw new HttpError(409, "log_not_approved");
    const cdb = collections(deps.db);
    const donor = await cdb.donors.findOne({ _id: log.donor_id, org_id: log.org_id });
    if (!donor) throw notFound();
    assertNoPii(log.approved, donor, access.user.name);
    const prior = await cdb.warmth_ratings.findOne({ org_id: log.org_id, call_id: log._id });
    if (prior) {
      if (prior.idempotency_key === body.idempotency_key) return c.json({ warmth: ratingView(prior) });
      throw new HttpError(409, "warmth_already_submitted");
    }
    const enabled = !!(deps.env.AWS_REGION && deps.env.BEDROCK_MODEL_ID);
    const rating: WarmthDoc = { _id: randomUUID(), org_id: log.org_id, team_id: log.team_id, call_id: log._id, caller_id: access.user.id, volunteer_score: body.score, llm_score: null, llm_reason: null, llm_status: enabled ? "unavailable" : "disabled", idempotency_key: body.idempotency_key, created_at: nowOf(deps) };
    try { await cdb.warmth_ratings.insertOne(rating); }
    catch (err) {
      const retry = await cdb.warmth_ratings.findOne({ org_id: log.org_id, call_id: log._id });
      if (retry?.idempotency_key === body.idempotency_key) return c.json({ warmth: ratingView(retry) });
      if (retry) throw new HttpError(409, "warmth_already_submitted");
      throw err;
    }
    if (enabled) {
      const result = await modelWarmth(deps, log.approved, await orgModelContext(deps, log.org_id));
      if (result) {
        try {
          assertNoPiiText(result.reason, donor, access.user.name);
          await cdb.warmth_ratings.updateOne({ _id: rating._id, org_id: log.org_id }, { $set: { llm_score: result.score, llm_reason: result.reason, llm_status: "ok" } });
        } catch { /* Untrusted output remains unavailable. */ }
      }
    }
    const stored = await cdb.warmth_ratings.findOne({ _id: rating._id, org_id: log.org_id });
    return c.json({ warmth: ratingView(stored ?? rating) }, 201);
  });

  api.get("/follow-ups/:id", async (c) => {
    const fu = await visibleFollowUp(deps, c.get("access"), c.req.param("id"));
    requireRole(c.get("access"), fu.team_id, "caller");
    return c.json({ follow_up: followUpView(fu, await teamTimezone(deps, fu.org_id, fu.team_id), nowOf(deps)) });
  });
  api.post("/follow-ups/:id/complete", async (c) => c.json({ result: await changeFollowUp(deps, c.get("access"), c.req.param("id"), "complete", parseBody(FollowUpAction, await jsonBody(c))) }));
  api.post("/follow-ups/:id/handoff", async (c) => c.json({ result: await changeFollowUp(deps, c.get("access"), c.req.param("id"), "handoff", parseBody(HandoffBody, await jsonBody(c))) }));
  api.post("/follow-ups/:id/cancel", async (c) => {
    const body = parseBody(FollowUpAction, await jsonBody(c));
    if (!body.note) throw new HttpError(400, "note_required");
    return c.json({ result: await changeFollowUp(deps, c.get("access"), c.req.param("id"), "cancel", body) });
  });

  api.get("/coordinator/queue", async (c) => {
    const access = c.get("access");
    const orgId = requireOrg(access);
    const teams = [...access.roles.keys()].filter((id) => isCoordinator(access, id));
    if (!teams.length) throw new HttpError(403, "forbidden");
    const cdb = collections(deps.db);
    const [flags, limits] = await Promise.all([
      cdb.call_flags.find({ org_id: orgId, team_id: { $in: teams }, status: "proposed" }).sort({ created_at: -1 }).toArray(),
      cdb.pending_limits.find({ org_id: orgId, team_id: { $in: teams }, status: "pending" }).sort({ created_at: -1 }).toArray(),
    ]);
    const sourceLogs = await cdb.call_logs.find({ org_id: orgId, _id: { $in: flags.map((f) => f.log_id) } }).toArray();
    const byId = new Map(sourceLogs.map((log) => [log._id, log]));
    return c.json({ flags: flags.map((f) => ({ ...f, log: byId.get(f.log_id)?.approved ?? null, advisory: "Suggested by rules, needs review." })), pending_limits: limits });
  });
  for (const action of ["approve", "override", "resolve"] as const) {
    api.post(`/flags/:id/${action}`, async (c) => {
      const body = parseBody(DecisionBody, await jsonBody(c));
      return c.json({ flag: await decideFlag(deps, c.get("access"), c.req.param("id"), action, body.note ?? null) });
    });
  }
  for (const action of ["approve", "reject"] as const) {
    api.post(`/pending-limits/:id/${action}`, async (c) => c.json({ pending_limit: await decideLimit(deps, c.get("access"), c.req.param("id"), action) }));
  }

  return api;
}
