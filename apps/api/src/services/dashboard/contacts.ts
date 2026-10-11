import type { DonorDoc, DonorSegment } from "@sc/shared";
import { randomUUID } from "node:crypto";
import { appendAudit } from "../../db/audit.ts";
import { collections } from "../../db/collections.ts";
import { withTx } from "../../db/tx.ts";
import { HttpError, notFound } from "../../http.ts";
import type { Access } from "../../auth/access.ts";
import { nowOf, type Deps } from "../context.ts";
import { displayNames, todayIn } from "./util.ts";
import { activeLimitDocs, ensureLimitRecords, limitHistory } from "./limits.ts";
import { p2 } from "./p2Docs.ts";
import type { Scope } from "./scope.ts";

/** first_time: at most one past gift. lapsed: last gift over 12 months ago. otherwise recent. */
export function donorSegment(d: Pick<DonorDoc, "past_gift_count">, lastGift: Date | null, now: Date): DonorSegment {
  if (d.past_gift_count <= 1) return "first_time";
  if (lastGift && now.getTime() - lastGift.getTime() > 365 * 86_400_000) return "lapsed";
  return "recent";
}

export async function lastGiftByDonor(deps: Deps, orgId: string): Promise<Map<string, Date>> {
  const rows = await collections(deps.db).gifts.aggregate<{ _id: string; last: Date }>([{ $match: { org_id: orgId } }, { $group: { _id: "$donor_id", last: { $max: "$gift_date" } } }]).toArray();
  return new Map(rows.map((r) => [r._id, r.last]));
}

export interface ContactFilters {
  team_id?: string | undefined;
  campaign?: string | undefined;
  gift_band?: string | undefined;
  last_contact_before?: string | undefined;
  never_contacted?: boolean | undefined;
  has_open_follow_ups?: boolean | undefined;
  has_limits?: boolean | undefined;
}

export const CONTACT_SORTS = ["name", "campaign", "last_contact", "gift_band"] as const;
export type ContactSort = (typeof CONTACT_SORTS)[number];

export async function listContacts(deps: Deps, scope: Scope, q: { filters: ContactFilters; sort: ContactSort; dir: "asc" | "desc"; cursor: number; limit: number }) {
  const c = collections(deps.db);
  const { call_logs, follow_ups } = p2(deps.db);
  const match: Record<string, unknown> = { org_id: scope.orgId, team_ids: { $in: scope.teamIds } };
  if (q.filters.campaign) match.campaign = q.filters.campaign;
  if (q.filters.gift_band) match.gift_band = q.filters.gift_band;
  if (q.filters.has_limits === true) match["limits.0"] = { $exists: true };
  if (q.filters.has_limits === false) match.limits = { $size: 0 };

  const lastContactRows = await call_logs
    .aggregate<{ _id: string; last: Date }>([{ $match: { org_id: scope.orgId, status: "approved" } }, { $group: { _id: "$donor_id", last: { $max: "$approved_at" } } }])
    .toArray();
  const lastContact = new Map(lastContactRows.map((r) => [r._id, r.last]));
  const openRows = await follow_ups.aggregate<{ _id: string; n: number }>([{ $match: { org_id: scope.orgId, status: "open" } }, { $group: { _id: "$donor_id", n: { $sum: 1 } } }]).toArray();
  const openFu = new Map(openRows.map((r) => [r._id, r.n]));

  const donors = await c.donors.find(match).limit(5000).toArray();
  const teamNames = scope.teams;
  let rows = donors.map((d) => ({
    id: d._id,
    external_id: d.external_id,
    first_name: d.first_name,
    last_name: d.last_name,
    campaign: d.campaign,
    gift_band: d.gift_band,
    region: d.region ?? null,
    team_names: d.team_ids.map((t) => teamNames.get(t)?.name).filter((n): n is string => !!n),
    team_ids: d.team_ids,
    last_contact: lastContact.get(d._id) ?? null,
    open_follow_ups: openFu.get(d._id) ?? 0,
    limits_present: d.limits.length > 0,
  }));
  if (q.filters.team_id) rows = rows.filter((r) => r.team_ids.includes(q.filters.team_id!));
  if (q.filters.last_contact_before) {
    const cutoff = new Date(`${q.filters.last_contact_before}T00:00:00Z`);
    rows = rows.filter((r) => !r.last_contact || r.last_contact < cutoff);
  }
  if (q.filters.never_contacted) rows = rows.filter((r) => !r.last_contact);
  if (q.filters.has_open_follow_ups === true) rows = rows.filter((r) => r.open_follow_ups > 0);
  if (q.filters.has_open_follow_ups === false) rows = rows.filter((r) => r.open_follow_ups === 0);

  const dir = q.dir === "desc" ? -1 : 1;
  const key = (r: (typeof rows)[number]): string | number =>
    q.sort === "campaign" ? r.campaign.toLowerCase() : q.sort === "gift_band" ? r.gift_band : q.sort === "last_contact" ? (r.last_contact?.getTime() ?? 0) : `${r.last_name} ${r.first_name}`.toLowerCase();
  rows.sort((a, b) => (key(a) < key(b) ? -dir : key(a) > key(b) ? dir : a.id < b.id ? -1 : 1));
  const page = rows.slice(q.cursor, q.cursor + q.limit);
  return {
    total: rows.length,
    contacts: page.map(({ team_ids: _ids, ...r }) => r),
    next_cursor: q.cursor + q.limit < rows.length ? String(q.cursor + q.limit) : null,
  };
}

/** Donor the coordinator may manage: in the org, on at least one team they coordinate. */
export async function donorForCoordinator(deps: Deps, access: Access, orgId: string, donorId: string): Promise<DonorDoc> {
  const donor = await collections(deps.db).donors.findOne({ _id: donorId, org_id: orgId });
  if (!donor || !donor.team_ids.some((t) => access.roles.get(t) === "coordinator")) throw notFound();
  return donor;
}

/** The dossier: only stated, sourced, or approved data. No inferred fields. */
export async function getDossier(deps: Deps, access: Access, orgId: string, donorId: string) {
  const donor = await donorForCoordinator(deps, access, orgId, donorId);
  await ensureLimitRecords(deps, donor, access.user.id);
  const c = collections(deps.db);
  const { call_logs, follow_ups } = p2(deps.db);
  const [limits, preferences, logs, fus, gifts] = await Promise.all([
    activeLimitDocs(deps, orgId, donor._id, "limit"),
    activeLimitDocs(deps, orgId, donor._id, "preference"),
    call_logs.find({ org_id: orgId, donor_id: donor._id, status: "approved" }).sort({ approved_at: -1 }).limit(50).toArray(),
    follow_ups.find({ org_id: orgId, donor_id: donor._id, status: "open" }).sort({ due_date: 1 }).toArray(),
    c.gifts.find({ org_id: orgId, donor_id: donor._id }).sort({ gift_date: -1 }).toArray(),
  ]);
  const names = await displayNames(deps, [...logs.map((l) => l.caller_id), ...fus.map((f) => f.owner_user_id)]);
  const today = (teamId: string) => todayIn(access.teams.get(teamId)?.timezone ?? null, nowOf(deps));
  return {
    donor: {
      id: donor._id,
      external_id: donor.external_id,
      first_name: donor.first_name,
      last_name: donor.last_name,
      campaign: donor.campaign,
      gift_band: donor.gift_band,
      past_gift_count: donor.past_gift_count,
      last_gift_band: donor.last_gift_band,
      region: donor.region ?? null,
      teams: donor.team_ids.map((t) => ({ id: t, name: access.teams.get(t)?.name ?? "" })).filter((t) => t.name),
    },
    limits: limits.map(({ key, value, source, stated_on, version, created_at }) => ({ key, value, source, stated_on, version, recorded_at: created_at })),
    preferences: preferences.map(({ key, value, source, stated_on, version, created_at }) => ({ key, value, source, stated_on, version, recorded_at: created_at })),
    follow_ups: fus.map((f) => ({ id: f._id, action: f.action, due_date: f.due_date, owner: names.get(f.owner_user_id) ?? "", overdue: !!f.due_date && f.due_date < today(f.team_id) })),
    timeline: logs.map((l) => ({ id: l._id, at: l.approved_at, caller: names.get(l.caller_id) ?? "", outcome: l.approved?.outcome ?? null, preference: l.approved?.preference ?? null, reason: l.approved?.donor_stated_reason ?? "" })),
    gifts: gifts.map((g) => ({ id: g._id, amount_band: g.amount_band, campaign: g.campaign, gift_date: g.gift_date })),
  };
}

export async function getContactHistory(deps: Deps, access: Access, orgId: string, donorId: string) {
  const donor = await donorForCoordinator(deps, access, orgId, donorId);
  await ensureLimitRecords(deps, donor, access.user.id);
  const versions = await limitHistory(deps, orgId, donor._id);
  const names = await displayNames(deps, versions.map((v) => v.created_by));
  return { versions: versions.map((v) => ({ key: v.key, kind: v.kind, version: v.version, value: v.value, source: v.source, stated_on: v.stated_on, status: v.status, recorded_at: v.created_at, recorded_by: names.get(v.created_by) ?? "" })) };
}

/**
 * Retention: delete the dossier. Removes the donor, gifts, limit versions, approved and draft
 * logs, flags, pending limits, follow-ups, and warmth ratings for that donor. One audit row,
 * with counts only (no name, no external id).
 */
export async function deleteDossier(deps: Deps, access: Access, orgId: string, donorId: string, confirm: string): Promise<{ deleted: Record<string, number> }> {
  const donor = await donorForCoordinator(deps, access, orgId, donorId);
  if (confirm !== donor.external_id) throw new HttpError(422, "confirmation_mismatch");
  const c = collections(deps.db);
  const px = p2(deps.db);
  const deleted = await withTx(deps.client, async (session) => {
    const logIds = (await px.call_logs.find({ org_id: orgId, donor_id: donor._id }, { session, projection: { _id: 1 } }).toArray()).map((l) => l._id);
    const r = {
      warmth_ratings: (await px.warmth_ratings.deleteMany({ org_id: orgId, call_id: { $in: logIds } }, { session })).deletedCount,
      flags: (await px.flags.deleteMany({ org_id: orgId, donor_id: donor._id }, { session })).deletedCount,
      pending_limits: (await px.pending_limits.deleteMany({ org_id: orgId, donor_id: donor._id }, { session })).deletedCount,
      follow_ups: (await px.follow_ups.deleteMany({ org_id: orgId, donor_id: donor._id }, { session })).deletedCount,
      call_logs: (await px.call_logs.deleteMany({ org_id: orgId, donor_id: donor._id }, { session })).deletedCount,
      donor_limits: (await c.donor_limits.deleteMany({ org_id: orgId, donor_id: donor._id }, { session })).deletedCount,
      gifts: (await c.gifts.deleteMany({ org_id: orgId, donor_id: donor._id }, { session })).deletedCount,
      donors: (await c.donors.deleteOne({ _id: donor._id, org_id: orgId }, { session })).deletedCount,
    };
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "contact.delete", target_type: "donor", target_id: randomUUID(), note: `retention delete: ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(", ")}` }, session);
    return r;
  });
  return { deleted };
}
