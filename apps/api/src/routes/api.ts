/** Application routes under /api. Every route requires a Better Auth session except invite lookup/accept. */
import {
  AcceptInvite,
  ChangeMemberRole,
  CoordinatorOnboarding,
  CreateInvite,
  CreateTeam,
  SeedKind,
  UpdateProfile,
  UpdateTeam,
  UserType,
  type FactSheetDoc,
} from "@sc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { loadAccess, requireCoordinator, requireOrg, requireRole, type Access, type SessionUser } from "../auth/access.ts";
import { appendAudit } from "../db/audit.ts";
import { collections } from "../db/collections.ts";
import { jsonBody, notFound, parseBody } from "../http.ts";
import { toCsv } from "../imports/csv.ts";
import { ImportRequest, commitImport, previewImport } from "../imports/importer.ts";
import type { Deps } from "../services/context.ts";
import { acceptInvite, createInvite, listInvites, lookupInvite, resendInvite, revokeInvite } from "../services/invites.ts";
import { onboardCoordinator, toUserKey } from "../services/orgs.ts";
import { archiveTeam, changeMemberRole, createTeam, listMembers, removeMember, teamTree, updateTeam } from "../services/teams.ts";

export type ApiEnv = { Variables: { user: SessionUser | null; access: Access } };

const PUBLIC_PATHS = new Set(["/invites/lookup", "/invites/accept"]);

export async function sessionUser(deps: Deps, headers: Headers): Promise<SessionUser | null> {
  const s = await deps.auth.api.getSession({ headers });
  if (!s) return null;
  const u = s.user as typeof s.user & { user_type?: unknown; display_name?: string | null; timezone?: string | null };
  const type = UserType.safeParse(u.user_type);
  if (!type.success) return null;
  return { id: u.id, email: u.email, name: u.name, user_type: type.data, display_name: u.display_name ?? null, timezone: u.timezone ?? null };
}

export function apiRoutes(deps: Deps) {
  const api = new Hono<ApiEnv>();

  api.use("*", async (c, next) => {
    const user = await sessionUser(deps, c.req.raw.headers);
    c.set("user", user);
    const sub = c.req.path.replace(/^\/api/, "");
    if (!user) {
      if (PUBLIC_PATHS.has(sub)) return next();
      return c.json({ error: "unauthenticated" }, 401);
    }
    c.set("access", await loadAccess(deps.db, user));
    return next();
  });

  // ---------- me / onboarding ----------
  api.get("/me", async (c) => {
    const access = c.get("access");
    const org = access.orgId ? await collections(deps.db).organizations.findOne({ _id: access.orgId }) : null;
    return c.json({
      user: access.user,
      org: org ? { id: org._id, name: org.name, slug: org.slug } : null,
      onboarding_required: !access.orgId,
      teams: teamTree(access),
    });
  });

  api.patch("/me", async (c) => {
    const user = c.get("access").user;
    const body = parseBody(UpdateProfile, await jsonBody(c));
    const set: Record<string, string> = {};
    if (body.display_name) set.display_name = set.name = body.display_name;
    if (body.timezone) set.timezone = body.timezone;
    await collections(deps.db).users.updateOne({ _id: toUserKey(user.id) }, { $set: set });
    return c.json({ ok: true });
  });

  api.post("/onboarding/coordinator", async (c) => {
    const body = parseBody(CoordinatorOnboarding, await jsonBody(c));
    const { org, rootTeam } = await onboardCoordinator(deps, c.get("access").user, body);
    return c.json({ org, root_team: rootTeam }, 201);
  });

  // ---------- teams ----------
  api.get("/teams", (c) => {
    requireOrg(c.get("access"));
    return c.json({ teams: teamTree(c.get("access")) });
  });

  api.post("/teams", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    const body = parseBody(CreateTeam, await jsonBody(c));
    return c.json({ team: await createTeam(deps, access, orgId, body) }, 201);
  });

  api.patch("/teams/:id", async (c) => {
    const access = c.get("access");
    const orgId = requireOrg(access);
    const body = parseBody(UpdateTeam, await jsonBody(c));
    return c.json({ team: await updateTeam(deps, access, orgId, c.req.param("id"), body) });
  });

  api.post("/teams/:id/archive", async (c) => {
    const access = c.get("access");
    await archiveTeam(deps, access, requireOrg(access), c.req.param("id"));
    return c.json({ ok: true });
  });

  api.get("/teams/:id/members", async (c) => {
    const access = c.get("access");
    return c.json({ members: await listMembers(deps, access, requireOrg(access), c.req.param("id")) });
  });

  api.patch("/memberships/:id", async (c) => {
    const access = c.get("access");
    const body = parseBody(ChangeMemberRole, await jsonBody(c));
    await changeMemberRole(deps, access, requireOrg(access), c.req.param("id"), body.role);
    return c.json({ ok: true });
  });

  api.post("/memberships/:id/remove", async (c) => {
    const access = c.get("access");
    await removeMember(deps, access, requireOrg(access), c.req.param("id"));
    return c.json({ ok: true });
  });

  // ---------- invites ----------
  api.post("/teams/:id/invites", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    const body = parseBody(CreateInvite, await jsonBody(c));
    const { invite, token } = await createInvite(deps, access, orgId, c.req.param("id"), body);
    const { token_hash: _h, ...safe } = invite;
    // No email service in the hackathon: when enabled, the coordinator gets the link to copy.
    return c.json({ invite: safe, ...(deps.env.INVITE_LINK_IN_RESPONSE === "1" ? { link: `${deps.env.APP_ORIGIN ?? "http://localhost:5173"}/invite/${token}` } : {}) }, 201);
  });

  api.get("/invites", async (c) => {
    const access = c.get("access");
    return c.json({ invites: await listInvites(deps, access, requireCoordinator(access)) });
  });

  api.post("/invites/:id/resend", async (c) => {
    const access = c.get("access");
    const { token } = await resendInvite(deps, access, requireCoordinator(access), c.req.param("id"));
    return c.json({ ok: true, ...(deps.env.INVITE_LINK_IN_RESPONSE === "1" ? { link: `${deps.env.APP_ORIGIN ?? "http://localhost:5173"}/invite/${token}` } : {}) });
  });

  api.post("/invites/:id/revoke", async (c) => {
    const access = c.get("access");
    await revokeInvite(deps, access, requireCoordinator(access), c.req.param("id"));
    return c.json({ ok: true });
  });

  // Token travels in the body, not the URL, so it never lands in access logs.
  api.post("/invites/lookup", async (c) => {
    const { token } = parseBody(z.strictObject({ token: z.string().min(20).max(200) }), await jsonBody(c));
    return c.json(await lookupInvite(deps, token));
  });

  api.post("/invites/accept", async (c) => {
    const body = parseBody(AcceptInvite, await jsonBody(c));
    const user = c.get("user");
    const res = await acceptInvite(deps, body, user ? { id: user.id, email: user.email } : null);
    for (const cookie of res.setCookie) c.header("set-cookie", cookie, { append: true });
    return c.json({ ok: true, team_id: res.team_id });
  });

  // ---------- donors ----------
  api.get("/donors", async (c) => {
    const access = c.get("access");
    const orgId = requireOrg(access);
    const teamId = c.req.query("team_id");
    const visible = teamId ? [requireRole(access, teamId, "caller")._id] : [...access.roles.keys()];
    const donors = await collections(deps.db).donors.find({ org_id: orgId, team_ids: { $in: visible } }).sort({ last_name: 1 }).limit(500).toArray();
    return c.json({ donors });
  });

  api.get("/donors/:id", async (c) => {
    const access = c.get("access");
    const orgId = requireOrg(access);
    const donor = await collections(deps.db).donors.findOne({ _id: c.req.param("id"), org_id: orgId });
    if (!donor || !donor.team_ids.some((t) => access.roles.has(t))) throw notFound();
    return c.json({ donor });
  });

  api.get("/campaigns", async (c) => {
    const orgId = requireOrg(c.get("access"));
    return c.json({ campaigns: await collections(deps.db).campaigns.find({ org_id: orgId }).sort({ name: 1 }).toArray() });
  });

  // ---------- fact sheets ----------
  api.get("/fact-sheets", async (c) => {
    const access = c.get("access");
    const orgId = requireOrg(access);
    const isCoordinator = access.user.user_type === "coordinator" && [...access.roles.values()].includes("coordinator");
    const sheets = await collections(deps.db).fact_sheets.find({ org_id: orgId }).sort({ created_at: -1 }).toArray();
    // Callers see approved items only.
    const visible: FactSheetDoc[] = isCoordinator ? sheets : sheets.map((s) => ({ ...s, items: s.items.filter((i) => i.status === "approved") }));
    return c.json({ fact_sheets: visible });
  });

  api.post("/fact-sheets/:id/items/:itemId/approve", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    const res = await collections(deps.db).fact_sheets.updateOne(
      { _id: c.req.param("id"), org_id: orgId, "items.id": c.req.param("itemId") },
      { $set: { "items.$.status": "approved" } },
    );
    if (!res.matchedCount) throw notFound();
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "fact.approve", target_type: "fact_item", target_id: c.req.param("itemId") });
    return c.json({ ok: true });
  });

  api.get("/rubrics", async (c) => {
    const access = c.get("access");
    const orgId = requireOrg(access);
    const rubrics = await collections(deps.db).rubrics.find({ org_id: orgId, $or: [{ team_id: null }, { team_id: { $in: [...access.roles.keys()] } }] }).toArray();
    return c.json({ rubrics });
  });

  // ---------- imports ----------
  api.post("/imports/:kind/preview", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    const kind = parseBody(SeedKind, c.req.param("kind"));
    const body = parseBody(ImportRequest, await jsonBody(c));
    return c.json(await previewImport(deps, access, orgId, kind, body));
  });

  api.post("/imports/:kind/commit", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    const kind = parseBody(SeedKind, c.req.param("kind"));
    const body = parseBody(ImportRequest, await jsonBody(c));
    const { seed_run } = await commitImport(deps, access, orgId, kind, body);
    return c.json({ seed_run: { ...seed_run, rejected_rows: seed_run.rejected_rows.slice(0, 50) } }, 201);
  });

  api.get("/seed-runs", async (c) => {
    const orgId = requireCoordinator(c.get("access"));
    const runs = await collections(deps.db).seed_runs.find({ org_id: orgId }, { projection: { rejected_rows: 0 } }).sort({ created_at: -1 }).limit(100).toArray();
    return c.json({ seed_runs: runs });
  });

  api.get("/seed-runs/:id/rejects.csv", async (c) => {
    const orgId = requireCoordinator(c.get("access"));
    const run = await collections(deps.db).seed_runs.findOne({ _id: c.req.param("id"), org_id: orgId });
    if (!run) throw notFound();
    const headers = [...new Set(run.rejected_rows.flatMap((r) => Object.keys(r.values)))];
    const csv = toCsv(["row", ...headers, "reasons"], run.rejected_rows.map((r) => ({ row: String(r.row), ...r.values, reasons: r.reasons.join("; ") })));
    c.header("content-type", "text/csv; charset=utf-8");
    c.header("content-disposition", `attachment; filename="rejects-${run.kind}-${run._id.slice(0, 8)}.csv"`);
    return c.body(csv);
  });

  return api;
}
