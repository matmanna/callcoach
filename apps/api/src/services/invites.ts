/**
 * Invites. Only a SHA-256 of the token is stored. Links are printed to the API log when
 * MAIL_MODE=console (no email service in the hackathon).
 */
import type { InviteDoc, TeamRole } from "@sc/shared";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { requireRole, type Access } from "../auth/access.ts";
import { appendAudit } from "../db/audit.ts";
import { collections } from "../db/collections.ts";
import { withTx } from "../db/tx.ts";
import { HttpError, notFound } from "../http.ts";
import { nowOf, type Deps } from "./context.ts";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export type InviteState = "pending" | "accepted" | "expired" | "revoked";

export function inviteState(inv: InviteDoc, now: Date): InviteState {
  if (inv.accepted_at) return "accepted";
  if (inv.revoked_at) return "revoked";
  if (inv.expires_at.getTime() <= now.getTime()) return "expired";
  return "pending";
}

function sendLink(deps: Deps, inv: InviteDoc, token: string, teamName: string) {
  const origin = deps.env.APP_ORIGIN ?? "http://localhost:5173";
  const link = `${origin}/invite/${token}`;
  deps.mail(inv.email, `You're invited to ${teamName}`, link);
}

export async function createInvite(deps: Deps, access: Access, orgId: string, teamId: string, input: { email: string; role: TeamRole }): Promise<{ invite: InviteDoc; token: string }> {
  const team = requireRole(access, teamId, "coordinator");
  const c = collections(deps.db);
  const email = input.email.toLowerCase();
  const now = nowOf(deps);
  const pending = await c.invites.findOne({ org_id: orgId, team_id: teamId, email, accepted_at: null, revoked_at: null, expires_at: { $gt: now } });
  if (pending) throw new HttpError(409, "invite_pending", { invite_id: pending._id });
  const token = newToken();
  const invite: InviteDoc = {
    _id: randomUUID(),
    org_id: orgId,
    team_id: teamId,
    email,
    role: input.role,
    token_hash: hashToken(token),
    invited_by: access.user.id,
    created_at: now,
    expires_at: new Date(now.getTime() + INVITE_TTL_MS),
    accepted_at: null,
    accepted_by: null,
    revoked_at: null,
  };
  await withTx(deps.client, async (session) => {
    await c.invites.insertOne(invite, { session });
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "invite.create", target_type: "invite", target_id: invite._id, note: input.role }, session);
  });
  sendLink(deps, invite, token, team.name);
  return { invite, token };
}

async function loadInviteForCoordinator(deps: Deps, access: Access, orgId: string, inviteId: string): Promise<InviteDoc> {
  const inv = await collections(deps.db).invites.findOne({ _id: inviteId, org_id: orgId });
  if (!inv) throw notFound();
  requireRole(access, inv.team_id, "coordinator");
  return inv;
}

/** Resend rotates the token (old link stops working) and resets the 7-day expiry. */
export async function resendInvite(deps: Deps, access: Access, orgId: string, inviteId: string): Promise<{ token: string }> {
  const inv = await loadInviteForCoordinator(deps, access, orgId, inviteId);
  if (inv.accepted_at || inv.revoked_at) throw new HttpError(410, inv.accepted_at ? "already_used" : "revoked");
  const token = newToken();
  const now = nowOf(deps);
  const c = collections(deps.db);
  await c.invites.updateOne({ _id: inv._id }, { $set: { token_hash: hashToken(token), expires_at: new Date(now.getTime() + INVITE_TTL_MS) } });
  await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "invite.resend", target_type: "invite", target_id: inv._id });
  const team = await c.teams.findOne({ _id: inv.team_id });
  sendLink(deps, inv, token, team?.name ?? "your team");
  return { token };
}

export async function revokeInvite(deps: Deps, access: Access, orgId: string, inviteId: string): Promise<void> {
  const inv = await loadInviteForCoordinator(deps, access, orgId, inviteId);
  if (inv.accepted_at) throw new HttpError(410, "already_used");
  if (inv.revoked_at) return;
  await collections(deps.db).invites.updateOne({ _id: inv._id }, { $set: { revoked_at: nowOf(deps) } });
  await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "invite.revoke", target_type: "invite", target_id: inv._id });
}

export async function listInvites(deps: Deps, access: Access, orgId: string) {
  const teamIds = [...access.roles.entries()].filter(([, r]) => r === "coordinator").map(([id]) => id);
  const now = nowOf(deps);
  const invs = await collections(deps.db).invites.find({ org_id: orgId, team_id: { $in: teamIds } }).sort({ created_at: -1 }).toArray();
  return invs.map(({ token_hash: _omit, ...rest }) => ({ ...rest, state: inviteState(rest as InviteDoc, now), team_name: access.teams.get(rest.team_id)?.name ?? "" }));
}

/** Public: what the invite is for. Expired, revoked, and used invites return 410. */
export async function lookupInvite(deps: Deps, token: string) {
  const c = collections(deps.db);
  const inv = await c.invites.findOne({ token_hash: hashToken(token) });
  if (!inv) throw notFound();
  const state = inviteState(inv, nowOf(deps));
  if (state !== "pending") throw new HttpError(410, state === "accepted" ? "already_used" : state);
  const [team, org, existing] = await Promise.all([
    c.teams.findOne({ _id: inv.team_id }),
    c.organizations.findOne({ _id: inv.org_id }),
    c.users.findOne({ email: inv.email }),
  ]);
  return { email: inv.email, role: inv.role, team_name: team?.name ?? "", team_focus: team?.focus ?? "", org_name: org?.name ?? "", has_account: !!existing };
}

export interface AcceptInput {
  token: string;
  password?: string;
  display_name?: string;
  timezone?: string;
}

/**
 * Accept. Idempotent: a second accept of the same token returns 410 already_used (and changes
 * nothing). New users are created here, server-side, as `volunteer` (or `coordinator` when the
 * invite role is coordinator). Existing users must be signed in as the invited email.
 */
export async function acceptInvite(
  deps: Deps,
  input: AcceptInput,
  sessionUser: { id: string; email: string } | null,
): Promise<{ user_id: string; team_id: string; setCookie: string[] }> {
  const c = collections(deps.db);
  const inv = await c.invites.findOne({ token_hash: hashToken(input.token) });
  if (!inv) throw notFound();
  const state = inviteState(inv, nowOf(deps));
  if (state !== "pending") throw new HttpError(410, state === "accepted" ? "already_used" : state);

  let userId: string;
  let setCookie: string[] = [];
  const existing = await c.users.findOne({ email: inv.email });
  if (existing) {
    if (!sessionUser || sessionUser.email.toLowerCase() !== inv.email) throw new HttpError(409, "sign_in_required", { email: inv.email });
    userId = sessionUser.id;
    const otherOrg = await c.memberships.findOne({ user_id: userId, status: "active", org_id: { $ne: inv.org_id } });
    if (otherOrg) throw new HttpError(409, "member_of_other_org");
  } else {
    if (!input.password || !input.display_name || !input.timezone) throw new HttpError(400, "invalid_payload", { issues: [{ path: "password", code: "required" }] });
    const res = await deps.auth.api.signUpEmail({
      body: {
        email: inv.email,
        password: input.password,
        name: input.display_name,
        user_type: inv.role === "coordinator" ? "coordinator" : "volunteer",
        display_name: input.display_name,
        timezone: input.timezone,
      },
      returnHeaders: true,
    });
    userId = res.response.user.id;
    setCookie = res.headers.getSetCookie();
  }

  // Claim the invite atomically so two concurrent accepts cannot both succeed.
  const now = nowOf(deps);
  const claimed = await c.invites.findOneAndUpdate(
    { _id: inv._id, accepted_at: null, revoked_at: null },
    { $set: { accepted_at: now, accepted_by: userId } },
    { returnDocument: "after" },
  );
  if (!claimed) throw new HttpError(410, "already_used");
  await c.memberships.updateOne(
    { user_id: userId, team_id: inv.team_id },
    { $set: { role: inv.role, status: "active", org_id: inv.org_id }, $setOnInsert: { _id: randomUUID(), joined_at: now } },
    { upsert: true },
  );
  await appendAudit(deps.db, { org_id: inv.org_id, who: userId, action: "invite.accept", target_type: "invite", target_id: inv._id });
  return { user_id: userId, team_id: inv.team_id, setCookie };
}
