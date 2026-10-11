/**
 * Coordinator dashboard routes (Prompt K3). Mounted on the S2 /api router, so every route has a
 * session and a loaded Access. Scope (org and team) is resolved here, server-side, for every view.
 */
import {
  DeleteDossier,
  FactApprove,
  FactReverify,
  FactVersionCreate,
  HandoffCreate,
  KnowledgeCreate,
  KnowledgeUpdate,
  LimitChange,
  PreferenceAdd,
  QueueBatchResolve,
  QueueDecision,
  RubricUpdate,
} from "@sc/shared";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { Access } from "../auth/access.ts";
import { requireCoordinator } from "../auth/access.ts";
import { collections } from "../db/collections.ts";
import { HttpError, jsonBody, notFound, parseBody } from "../http.ts";
import { toCsv } from "../imports/csv.ts";
import type { Deps } from "../services/context.ts";
import { CONTACT_SORTS, deleteDossier, donorForCoordinator, getContactHistory, getDossier, listContacts, type ContactSort } from "../services/dashboard/contacts.ts";
import { approveVersion, createVersion, factWarnings, listSheets, loadSheet, reverifyItem } from "../services/dashboard/facts.ts";
import { CHART_KINDS, COMPARE_KINDS, campaignsOverview, chart, compare, map, type ChartKind } from "../services/dashboard/insights.ts";
import { changeLimit } from "../services/dashboard/limits.ts";
import {
  acknowledgeItem,
  createEntry,
  createHandoff,
  decidePattern,
  listEntries,
  listHandoffs,
  listPatterns,
  publishEntry,
  retireEntry,
  rubricVersions,
  updateEntry,
  updateRubric,
} from "../services/dashboard/knowledge.ts";
import { batchResolve, decideFlag, getCall, listCalls, listFollowUps, listPendingLimits, listQueue } from "../services/dashboard/ops.ts";
import { overview, teamsPanel } from "../services/dashboard/overview.ts";
import { resolveScope, type Scope } from "../services/dashboard/scope.ts";
import { displayNames } from "../services/dashboard/util.ts";
import { listVolunteers, parseVolunteerSort, reassignVolunteer, volunteerTrend } from "../services/dashboard/volunteers.ts";
import type { ApiEnv } from "./api.ts";

const intParam = (v: string | undefined, d: number, max: number) => Math.min(max, Math.max(1, Number.parseInt(v ?? "", 10) || d));
const bool = (v: string | undefined): boolean | undefined => (v === "true" ? true : v === "false" ? false : undefined);

export function dashboardRoutes(api: Hono<ApiEnv>, deps: Deps) {
  const access = (c: Context<ApiEnv>): Access => c.get("access");
  const scopeOf = (c: Context<ApiEnv>): Scope => resolveScope(access(c), c.req.query("team_id"));

  // ---------- overview and teams ----------
  api.get("/dashboard/overview", async (c) => c.json(await overview(deps, scopeOf(c))));
  api.get("/dashboard/teams", async (c) => c.json(await teamsPanel(deps, scopeOf(c))));

  // ---------- contacts ----------
  api.get("/contacts", async (c) => {
    const scope = scopeOf(c);
    const q = c.req.query();
    const sort = (q.sort ?? "name") as ContactSort;
    if (!CONTACT_SORTS.includes(sort)) throw new HttpError(400, "sort_not_allowed", { allowed: CONTACT_SORTS });
    const cursor = Number.parseInt(q.cursor ?? "0", 10) || 0;
    return c.json(
      await listContacts(deps, scope, {
        filters: {
          team_id: q.filter_team,
          campaign: q.campaign,
          gift_band: q.gift_band,
          last_contact_before: q.last_contact_before && /^\d{4}-\d{2}-\d{2}$/.test(q.last_contact_before) ? q.last_contact_before : undefined,
          never_contacted: bool(q.never_contacted),
          has_open_follow_ups: bool(q.has_open_follow_ups),
          has_limits: bool(q.has_limits),
        },
        sort,
        dir: q.dir === "desc" ? "desc" : "asc",
        cursor: Math.max(0, cursor),
        limit: intParam(q.limit, 25, 100),
      }),
    );
  });
  api.get("/contacts/:id", async (c) => {
    const a = access(c);
    return c.json(await getDossier(deps, a, requireCoordinator(a), c.req.param("id")));
  });
  api.get("/contacts/:id/history", async (c) => {
    const a = access(c);
    return c.json(await getContactHistory(deps, a, requireCoordinator(a), c.req.param("id")));
  });
  api.patch("/contacts/:id/limits", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const body = parseBody(LimitChange, await jsonBody(c));
    const donor = await donorForCoordinator(deps, a, orgId, c.req.param("id"));
    return c.json({ limit: await changeLimit(deps, orgId, donor, a.user.id, body, "limit") });
  });
  api.post("/contacts/:id/preferences", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const body = parseBody(PreferenceAdd, await jsonBody(c));
    const donor = await donorForCoordinator(deps, a, orgId, c.req.param("id"));
    return c.json({ preference: await changeLimit(deps, orgId, donor, a.user.id, { action: "add", ...body }, "preference") }, 201);
  });
  api.delete("/contacts/:id", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const body = parseBody(DeleteDossier, await jsonBody(c));
    return c.json(await deleteDossier(deps, a, orgId, c.req.param("id"), body.confirm_external_id));
  });

  // ---------- volunteers ----------
  api.get("/volunteers", async (c) => {
    const q = c.req.query();
    const sort = parseVolunteerSort(q.sort);
    const status = q.status === "removed" || q.status === "all" ? q.status : "active";
    return c.json(await listVolunteers(deps, scopeOf(c), { sort, dir: q.dir === "desc" ? "desc" : "asc", status }));
  });
  api.get("/volunteers/:id/trend", async (c) => c.json(await volunteerTrend(deps, scopeOf(c), c.req.param("id"), intParam(c.req.query("weeks"), 12, 26))));
  api.post("/volunteers/:membershipId/reassign", async (c) => {
    const body = parseBody(z.strictObject({ to_team_id: z.string().min(1) }), await jsonBody(c));
    return c.json(await reassignVolunteer(deps, scopeOf(c), access(c), c.req.param("membershipId"), body.to_team_id));
  });

  // ---------- calls, queue, limits, follow-ups ----------
  api.get("/calls", async (c) => {
    const q = c.req.query();
    return c.json(await listCalls(deps, scopeOf(c), { cursor: Math.max(0, Number.parseInt(q.cursor ?? "0", 10) || 0), limit: intParam(q.limit, 25, 100), status: q.status, outcome: q.outcome, caller_id: q.caller_id }));
  });
  api.get("/calls/:id", async (c) => c.json(await getCall(deps, scopeOf(c), c.req.param("id"))));

  api.get("/queue", async (c) => c.json(await listQueue(deps, scopeOf(c))));
  api.post("/queue/batch-resolve", async (c) => {
    const body = parseBody(QueueBatchResolve, await jsonBody(c));
    return c.json(await batchResolve(deps, scopeOf(c), access(c), body.ids, body.note));
  });
  api.post("/queue/:id/decision", async (c) => {
    const body = parseBody(QueueDecision, await jsonBody(c));
    return c.json(await decideFlag(deps, scopeOf(c), access(c), c.req.param("id"), body));
  });
  api.get("/pending-limits", async (c) => c.json(await listPendingLimits(deps, scopeOf(c))));
  api.get("/follow-ups", async (c) => {
    const q = c.req.query();
    return c.json(await listFollowUps(deps, scopeOf(c), { status: q.status, overdue: bool(q.overdue), owner_id: q.owner_id }));
  });

  // ---------- fact sheets ----------
  api.post("/fact-sheets/:id/versions", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const body = parseBody(FactVersionCreate, await jsonBody(c));
    return c.json(await createVersion(deps, a, orgId, c.req.param("id"), body), 201);
  });
  api.post("/fact-sheets/:id/versions/:v/approve", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const body = parseBody(FactApprove, await jsonBody(c));
    // :v is the version document id.
    const v = await collections(deps.db).fact_item_versions.findOne({ _id: c.req.param("v"), org_id: orgId, sheet_id: c.req.param("id") });
    if (!v) throw notFound();
    return c.json(await approveVersion(deps, a, orgId, v.sheet_id, v.item_id, v.version, body.note));
  });
  api.post("/fact-sheets/:id/items/:item/reverify", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const body = parseBody(FactReverify, await jsonBody(c));
    return c.json(await reverifyItem(deps, a, orgId, c.req.param("id"), c.req.param("item"), body), 201);
  });
  api.post("/fact-sheets/check", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const body = parseBody(z.strictObject({ text: z.string().max(4000) }), await jsonBody(c));
    return c.json({ warnings: await factWarnings(deps, orgId, body.text) });
  });
  api.get("/fact-sheets/:id/versions", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const sheet = await loadSheet(deps, orgId, c.req.param("id"));
    const vs = await collections(deps.db).fact_item_versions.find({ org_id: orgId, sheet_id: sheet._id }).sort({ item_id: 1, version: 1 }).toArray();
    return c.json({ versions: vs.map((v) => ({ id: v._id, item_id: v.item_id, version: v.version, status: v.status, text: v.text, source: v.source, verified_on: v.verified_on, created_at: v.created_at })) });
  });

  // ---------- rubrics ----------
  api.put("/rubrics/:id", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const body = parseBody(RubricUpdate, await jsonBody(c));
    return c.json(await updateRubric(deps, a, orgId, c.req.param("id"), { items: body.items.map((i) => ({ ...i, conditional_on_tag: i.conditional_on_tag ?? null })), note: body.note }));
  });
  api.get("/rubrics/:id/versions", async (c) => c.json(await rubricVersions(deps, requireCoordinator(access(c)), c.req.param("id"))));

  // ---------- knowledge and handoffs ----------
  api.get("/knowledge", async (c) => c.json(await listEntries(deps, scopeOf(c), c.req.query("status"))));
  api.post("/knowledge", async (c) => {
    const body = parseBody(KnowledgeCreate, await jsonBody(c));
    return c.json(await createEntry(deps, scopeOf(c), access(c), body), 201);
  });
  api.patch("/knowledge/:id", async (c) => {
    const body = parseBody(KnowledgeUpdate, await jsonBody(c));
    return c.json(await updateEntry(deps, scopeOf(c), access(c), c.req.param("id"), body));
  });
  api.post("/knowledge/:id/publish", async (c) => c.json(await publishEntry(deps, scopeOf(c), access(c), c.req.param("id"))));
  api.post("/knowledge/:id/retire", async (c) => c.json(await retireEntry(deps, scopeOf(c), access(c), c.req.param("id"))));
  api.get("/handoffs", async (c) => c.json(await listHandoffs(deps, scopeOf(c), access(c))));
  api.post("/handoffs", async (c) => {
    const body = parseBody(HandoffCreate, await jsonBody(c));
    return c.json(await createHandoff(deps, scopeOf(c), access(c), body), 201);
  });
  api.post("/handoffs/:id/items/:itemId/acknowledge", async (c) => c.json(await acknowledgeItem(deps, scopeOf(c), access(c), c.req.param("id"), c.req.param("itemId"))));
  api.get("/coordinators", async (c) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const ids = await collections(deps.db).memberships.distinct("user_id", { org_id: orgId, role: "coordinator", status: "active" });
    const names = await displayNames(deps, ids);
    return c.json({ coordinators: ids.map((id) => ({ user_id: id, name: names.get(id) ?? "", is_me: id === a.user.id })) });
  });

  // ---------- insights ----------
  api.get("/insights/charts", async (c) => {
    const q = c.req.query();
    const kind = q.kind as ChartKind;
    if (!CHART_KINDS.includes(kind)) throw new HttpError(400, "unknown_chart", { allowed: CHART_KINDS });
    return c.json(await chart(deps, scopeOf(c), kind, q.from, q.to, { splitByTeam: q.split === "team" }));
  });
  api.get("/insights/map", async (c) => {
    const q = c.req.query();
    return c.json(await map(deps, scopeOf(c), q.level === "country" ? "country" : "region", q.from, q.to));
  });
  api.get("/insights/compare", async (c) => {
    const q = c.req.query();
    const kind = q.kind as (typeof COMPARE_KINDS)[number];
    if (!COMPARE_KINDS.includes(kind)) throw new HttpError(400, "unknown_comparison", { allowed: COMPARE_KINDS });
    return c.json(await compare(deps, scopeOf(c), kind, q.a ?? "", q.b ?? "", q.from, q.to));
  });
  api.get("/insights/campaigns", async (c) => c.json(await campaignsOverview(deps, scopeOf(c), c.req.query("from"), c.req.query("to"))));
  api.get("/patterns", async (c) => c.json(await listPatterns(deps, scopeOf(c).orgId, c.req.query("status"))));
  api.post("/patterns/:id/decision", async (c) => {
    const body = parseBody(z.strictObject({ action: z.enum(["approve", "retire"]) }), await jsonBody(c));
    const s = scopeOf(c);
    return c.json(await decidePattern(deps, s.orgId, access(c), c.req.param("id"), body.action));
  });

  // ---------- audit ----------
  const auditRows = async (c: Context<ApiEnv>, limit: number) => {
    const a = access(c);
    const orgId = requireCoordinator(a);
    const q = c.req.query();
    const filter: Record<string, unknown> = { org_id: orgId };
    if (q.actor) filter.who = q.actor;
    if (q.action) filter.action = q.action;
    if (q.target_type) filter.target_type = q.target_type;
    if (q.from || q.to) {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      if ((q.from && !re.test(q.from)) || (q.to && !re.test(q.to))) throw new HttpError(400, "invalid_range");
      filter.ts = { ...(q.from ? { $gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { $lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) };
    }
    const skip = Math.max(0, Number.parseInt(q.cursor ?? "0", 10) || 0);
    const col = deps.db.collection("audit_log");
    const total = await col.countDocuments(filter);
    const rows = await col.find(filter).sort({ ts: -1, _id: 1 }).skip(skip).limit(limit).toArray();
    const names = await displayNames(deps, rows.map((r) => String(r.who)));
    return { total, skip, rows: rows.map((r) => ({ id: String(r._id), ts: r.ts as Date, who: names.get(String(r.who)) ?? String(r.who), who_id: String(r.who), action: String(r.action), target_type: String(r.target_type), target_id: String(r.target_id), note: (r.note as string | null) ?? null })) };
  };
  api.get("/audit", async (c) => {
    const limit = intParam(c.req.query("limit"), 50, 200);
    const { total, skip, rows } = await auditRows(c, limit);
    return c.json({ total, rows, next_cursor: skip + limit < total ? String(skip + limit) : null });
  });
  api.get("/audit.csv", async (c) => {
    const { rows } = await auditRows(c, 5000);
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", 'attachment; filename="audit-log.csv"');
    return c.body(toCsv(["ts", "who", "action", "target_type", "target_id", "note"], rows.map((r) => ({ ts: r.ts.toISOString(), who: r.who, action: r.action, target_type: r.target_type, target_id: r.target_id, note: r.note ?? "" }))));
  });
  api.get("/audit/actors", async (c) => {
    const orgId = requireCoordinator(access(c));
    const ids = await deps.db.collection("audit_log").distinct("who", { org_id: orgId });
    const names = await displayNames(deps, ids as string[]);
    return c.json({ actors: (ids as string[]).map((id) => ({ id, name: names.get(id) ?? id })) });
  });

}
