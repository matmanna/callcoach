/**
 * Organization join codes. A coordinator generates a code and shares it. A volunteer who signs up
 * enters it to join the organization's main team as a caller, without an emailed invitation.
 *
 * The code is shown once, at generation. Only its SHA-256 hash is stored, the same way invitation
 * tokens are stored. Rotating makes the old code stop working at once.
 */
import type { OrganizationDoc } from "@sc/shared";
import { randomBytes, randomUUID } from "node:crypto";
import { appendAudit } from "../db/audit.ts";
import { collections } from "../db/collections.ts";
import { withTx } from "../db/tx.ts";
import { HttpError, notFound } from "../http.ts";
import { ensureTeamCallList, hashToken } from "./invites.ts";
import { nowOf, type Deps } from "./context.ts";

// No 0, O, 1, I, or L: easy to misread when read aloud.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

/** A new code, formatted as XXXX-XXXX for reading out loud. */
export function generateJoinCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]!).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Accepts the code with or without the dash, in any case, and with stray spaces. */
export function normalizeJoinCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const hashOf = (code: string) => hashToken(normalizeJoinCode(code));

export async function joinCodeStatus(deps: Deps, orgId: string) {
  const org = await collections(deps.db).organizations.findOne({ _id: orgId }, { projection: { invite_code_hash: 1, invite_code_rotated_at: 1 } });
  return { active: !!org?.invite_code_hash, rotated_at: org?.invite_code_rotated_at ?? null };
}

/** Coordinator action. Returns the new code once; it is not retrievable afterwards. */
export async function rotateJoinCode(deps: Deps, orgId: string, actorId: string): Promise<{ code: string; rotated_at: Date }> {
  const code = generateJoinCode();
  const now = nowOf(deps);
  await withTx(deps.client, async (session) => {
    await collections(deps.db).organizations.updateOne({ _id: orgId }, { $set: { invite_code_hash: hashOf(code), invite_code_rotated_at: now } }, { session });
    await appendAudit(deps.db, { org_id: orgId, who: actorId, action: "org.join_code.rotate", target_type: "organization", target_id: orgId }, session);
  });
  return { code, rotated_at: now };
}

/**
 * Volunteer action. Adds the user as a caller on the organization's main (root) team.
 * A wrong code and a missing org both return 404 with the same body, so codes cannot be probed.
 */
export async function joinWithCode(deps: Deps, user: { id: string; user_type: string }, input: string): Promise<{ org_id: string; team_id: string }> {
  if (user.user_type !== "volunteer") throw new HttpError(403, "forbidden");
  const c = collections(deps.db);
  if (await c.memberships.findOne({ user_id: user.id, status: "active" })) throw new HttpError(409, "already_in_org");
  if (!CODE_PATTERN.test(normalizeJoinCode(input))) throw notFound();
  const org: OrganizationDoc | null = await c.organizations.findOne({ invite_code_hash: hashOf(input) });
  if (!org) throw notFound();
  const root = await c.teams.findOne({ org_id: org._id, parent_team_id: null, archived_at: null });
  if (!root) throw notFound();
  const now = nowOf(deps);
  await withTx(deps.client, async (session) => {
    await c.memberships.insertOne({ _id: randomUUID(), org_id: org._id, user_id: user.id, team_id: root._id, role: "caller", status: "active", joined_at: now }, { session });
    await appendAudit(deps.db, { org_id: org._id, who: user.id, action: "org.join_code.join", target_type: "team", target_id: root._id }, session);
  });
  // Same call list an invited volunteer gets, so the Calls page has donors straight away.
  await ensureTeamCallList(deps, { org_id: org._id, team_id: root._id }, user.id);
  return { org_id: org._id, team_id: root._id };
}
