/** Application routes under /api. Every route requires a Better Auth session except invite lookup/accept. */
import {
  AcceptInvite,
  ChangeMemberRole,
  CoordinatorOnboarding,
  CreateInvite,
  CreateTeam,
  OrgProfileUpdate,
  RubricUpdate,
  SeedKind,
  ServiceScope,
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
import { HttpError, jsonBody, notFound, parseBody } from "../http.ts";
import { toCsv } from "../imports/csv.ts";
import { ImportRequest, commitImport, previewImport } from "../imports/importer.ts";
import type { Deps } from "../services/context.ts";
import { acceptInvite, acceptPendingInvite, createInvite, listInvites, listPendingInvitesForEmail, lookupInvite, resendInvite, revokeInvite } from "../services/invites.ts";
import { onboardCoordinator, toUserKey, updateOrgProfile } from "../services/orgs.ts";
import { setOrgRubricWeights, uploadOnboardingFactSheet } from "../services/onboarding.ts";
import { sampleSeedEnabled, seedSampleDataSafely } from "../services/sample.ts";
import { dashboardRoutes } from "./dashboard.ts";
import { callerVisibleItems, listSheets as listSheetViews, staleDays, loadSheet as loadSheetV, approveVersion as approveFactVersion } from "../services/dashboard/facts.ts";
import { nowOf } from "../services/context.ts";
import { archiveTeam, changeMemberRole, createTeam, listMembers, removeMember, teamTree, updateTeam } from "../services/teams.ts";
import { postCallRoutes } from "./postcall.ts";
import { volunteerRubric } from "../services/dashboard/rubricScores.ts";
import { activityHeatmap } from "../services/activity.ts";
import { searchFacts } from "../services/factSearch.ts";
import { joinCodeStatus, joinWithCode, rotateJoinCode } from "../services/orgCodes.ts";

export type ApiEnv = { Variables: { user: SessionUser | null; access: Access } };

const PUBLIC_PATHS = new Set(["/invites/lookup", "/invites/accept"]);

export async function sessionUser(deps: Deps, headers: Headers): Promise<SessionUser | null> {
  const s = await deps.auth.api.getSession({ headers });
  if (!s) return null;
  const u = s.user as typeof s.user & { user_type?: unknown; display_name?: string | null; timezone?: string | null; service_scope?: unknown; home_region?: string | null };
  const type = UserType.safeParse(u.user_type);
  if (!type.success) return null;
  const scope = ServiceScope.safeParse(u.service_scope);
  return { id: u.id, email: u.email, name: u.name, user_type: type.data, display_name: u.display_name ?? null, timezone: u.timezone ?? null, service_scope: scope.success ? scope.data : null, home_region: u.home_region ?? null };
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
    let access = c.get("access");
    // Coordinators of organizations created before automatic seeding get sample data once, on first sign-in.
    if (access.orgId && access.user.user_type === "coordinator" && sampleSeedEnabled(deps.env) && (await seedSampleDataSafely(deps, access.user))) {
      access = await loadAccess(deps.db, access.user);
    }
    const org = access.orgId ? await collections(deps.db).organizations.findOne({ _id: access.orgId }) : null;
    return c.json({
      user: access.user,
      org: org
        ? {
            id: org._id,
            name: org.name,
            slug: org.slug,
            nonprofit_status: org.nonprofit_status ?? null,
            annual_revenue_band: org.annual_revenue_band ?? null,
            staff_size_band: org.staff_size_band ?? null,
            mission: org.mission ?? null,
            country: org.country ?? null,
          }
        : null,
      onboarding_required: !access.orgId,
      pending_invites: await listPendingInvitesForEmail(deps, access.user.email),
      teams: teamTree(access),
    });
  });

  // Organization join code. Coordinators see whether one is active and rotate it. Volunteers enter it to join.
  api.get("/org/join-code", async (c) => c.json(await joinCodeStatus(deps, requireCoordinator(c.get("access")))));
  api.post("/org/join-code/rotate", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    parseBody(z.strictObject({}), await jsonBody(c));
    return c.json(await rotateJoinCode(deps, orgId, access.user.id));
  });
  api.post("/org/join", async (c) => {
    const user = c.get("user");
    if (!user) throw new Error("authenticated route missing session user");
    const body = parseBody(z.strictObject({ code: z.string().trim().min(8).max(12) }), await jsonBody(c));
    return c.json(await joinWithCode(deps, { id: user.id, user_type: user.user_type }, body.code), 201);
  });

  // The volunteer's own activity heatmap.
  api.get("/me/activity", async (c) => {
    const access = c.get("access");
    return c.json(await activityHeatmap(deps, { orgId: requireOrg(access), callerId: access.user.id }));
  });

  // The volunteer's own rubric results. Same rules as the coordinator view, for their calls only.
  api.get("/me/rubric", async (c) => {
    const orgId = requireOrg(c.get("access"));
    return c.json(await volunteerRubric(deps, orgId, c.get("access").user.id, null));
  });

  api.patch("/me", async (c) => {
    const user = c.get("access").user;
    const body = parseBody(UpdateProfile, await jsonBody(c));
    const set: Record<string, unknown> = {};
    if (body.display_name) set.display_name = set.name = body.display_name;
    if (body.timezone) set.timezone = body.timezone;
    // Validate the scope and region the user will have after this save, not just the fields sent.
    const current = await collections(deps.db).users.findOne({ _id: toUserKey(user.id) }, { projection: { service_scope: 1, home_region: 1 } });
    const scope = body.service_scope ?? current?.service_scope ?? null;
    const region = body.home_region !== undefined ? body.home_region : (current?.home_region ?? null);
    if (scope === "local" && !region) throw new HttpError(400, "invalid_payload", { issues: [{ path: "home_region", code: "required", message: "a local volunteer needs a home region" }] });
    if (body.service_scope) set.service_scope = body.service_scope;
    // A region only means something for local volunteers. Clear it when the scope widens.
    if (body.service_scope && body.service_scope !== "local") set.home_region = null;
    else if (body.home_region !== undefined) set.home_region = body.home_region;
    await collections(deps.db).users.updateOne({ _id: toUserKey(user.id) }, { $set: set });
    return c.json({ ok: true });
  });

  api.post("/onboarding/coordinator", async (c) => {
    const body = parseBody(CoordinatorOnboarding, await jsonBody(c));
    const { org, rootTeam } = await onboardCoordinator(deps, c.get("access").user, body);
    // Sample teams, donors, facts and a rubric for every new organization (when AUTO_SEED_SAMPLE_DATA=1).
    await seedSampleDataSafely(deps, c.get("access").user);
    return c.json({ org, root_team: rootTeam }, 201);
  });

  // Onboarding step 2 (and later edits from settings): organization profile.
  api.put("/org/profile", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    await updateOrgProfile(deps, access, orgId, parseBody(OrgProfileUpdate, await jsonBody(c)));
    return c.json({ ok: true });
  });

  // Onboarding step 3: the organization's fact sheet. Approved on upload; Bedrock reads approved facts as context.
  api.post("/onboarding/fact-sheet", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    const body = parseBody(ImportRequest, await jsonBody(c));
    return c.json(await uploadOnboardingFactSheet(deps, access, orgId, body), 201);
  });

  // Onboarding step 4: how much each rubric item counts. Creates the org rubric when none exists.
  api.put("/onboarding/rubric", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    return c.json(await setOrgRubricWeights(deps, access, orgId, parseBody(RubricUpdate, await jsonBody(c))));
  });

  api.post("/onboarding/invites/:id/accept", async (c) => {
    const user = c.get("user");
    if (!user) throw new Error("authenticated route missing session user");
    parseBody(z.strictObject({}), await jsonBody(c));
    return c.json({ ok: true, ...(await acceptPendingInvite(deps, c.req.param("id"), { id: user.id, email: user.email })) });
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
    const { invite, link } = await createInvite(deps, access, orgId, c.req.param("id"), body);
    const { token_hash: _h, ...safe } = invite;
    return c.json({ invite: safe, link }, 201);
  });

  api.get("/invites", async (c) => {
    const access = c.get("access");
    return c.json({ invites: await listInvites(deps, access, requireCoordinator(access)) });
  });

  api.post("/invites/:id/resend", async (c) => {
    const access = c.get("access");
    const { link } = await resendInvite(deps, access, requireCoordinator(access), c.req.param("id"));
    return c.json({ ok: true, link });
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
    // Coordinators get the versioned editor view (K3). Callers get approved, non-stale items only.
    if (isCoordinator) return c.json(await listSheetViews(deps, orgId, c.req.query("campaign")));
    const sheets = await collections(deps.db).fact_sheets.find({ org_id: orgId }).sort({ created_at: -1 }).toArray();
    const visible: FactSheetDoc[] = sheets.map((s) => ({ ...s, items: callerVisibleItems(s.items, nowOf(deps), staleDays(deps)) }));
    return c.json({ fact_sheets: visible });
  });

  // Keyword search over approved facts. Any signed-in member can search; drafts are never returned.
  api.get("/fact-sheets/search", async (c) => {
    const orgId = requireOrg(c.get("access"));
    return c.json({ results: await searchFacts(deps, orgId, c.req.query("q") ?? "") });
  });

  // Kept for S2 clients: approves the item's current draft version (second-approver rule applies).
  api.post("/fact-sheets/:id/items/:itemId/approve", async (c) => {
    const access = c.get("access");
    const orgId = requireCoordinator(access);
    await loadSheetV(deps, orgId, c.req.param("id"));
    const draft = await collections(deps.db).fact_item_versions.find({ org_id: orgId, sheet_id: c.req.param("id"), item_id: c.req.param("itemId"), status: "draft" }).sort({ version: -1 }).limit(1).next();
    if (!draft) throw notFound();
    await approveFactVersion(deps, access, orgId, draft.sheet_id, draft.item_id, draft.version);
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

  dashboardRoutes(api, deps); // K3 coordinator dashboard routes
  api.route("/", postCallRoutes(deps));
  return api;
}
