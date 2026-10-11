import type { Access } from "../auth/access.ts";
import { isOverdue } from "@sc/rules";
import { requireOrg, requireRole } from "../auth/access.ts";
import { collections } from "../db/collections.ts";
import { notFound } from "../http.ts";
import type { Deps } from "./context.ts";
import { nowOf } from "./context.ts";
import { toUserKey } from "./orgs.ts";
import { teamTimezone } from "./teamTimezone.ts";

/** Returns a donor only when a current membership grants caller access to one assigned team. */
export async function accessibleDonor(deps: Deps, access: Access, donorId: string) {
  const orgId = requireOrg(access);
  const donor = await collections(deps.db).donors.findOne({ _id: donorId, org_id: orgId });
  if (!donor) throw notFound();
  const teamId = donor.team_ids.find((id) => access.roles.has(id));
  if (!teamId) throw notFound();
  requireRole(access, teamId, "caller");
  return { donor, teamId, orgId };
}

export async function donorBrief(deps: Deps, access: Access, donorId: string) {
  const { donor, orgId } = await accessibleDonor(deps, access, donorId);
  const c = collections(deps.db);
  const visibleTeams = donor.team_ids.filter((id) => access.roles.has(id));
  const [logs, preferenceLogs, followUps, campaign] = await Promise.all([
    c.call_logs.find({ org_id: orgId, donor_id: donorId, team_id: { $in: visibleTeams }, status: "approved" }).sort({ approved_at: -1 }).limit(3).toArray(),
    c.call_logs.find({ org_id: orgId, donor_id: donorId, team_id: { $in: visibleTeams }, status: "approved" }, { projection: { "approved.preference": 1 } }).toArray(),
    c.follow_ups.find({ org_id: orgId, donor_id: donorId, team_id: { $in: visibleTeams }, status: { $in: ["open", "handed_off"] } }).sort({ due_date: 1 }).toArray(),
    c.campaigns.findOne({ org_id: orgId, name: donor.campaign }),
  ]);
  const sheets = campaign?.fact_sheet_ids.length
    ? await c.fact_sheets.find({ org_id: orgId, _id: { $in: campaign.fact_sheet_ids } }).toArray()
    : [];
  const approvedItems = sheets.flatMap((s) => s.items.filter((i) => i.status === "approved"));
  const ownerIds = [...new Set(approvedItems.map((i) => i.owner_user_id))];
  const authorIds = [...new Set(logs.map((l) => l.caller_id))];
  const people = await c.users.find({ _id: { $in: [...new Set([...ownerIds, ...authorIds])].map(toUserKey) } }).toArray();
  const names = new Map(people.map((u) => [String(u._id), u.display_name ?? u.name]));
  const days = Number(deps.env.FACT_STALE_DAYS ?? 365);
  const staleDays = Number.isFinite(days) && days >= 0 ? days : 365;
  const cutoff = new Date(nowOf(deps).getTime() - staleDays * 86400000).toISOString().slice(0, 10);
  const factItems = approvedItems.map((i) => ({
    id: i.id,
    text: i.text,
    source: i.source,
    verified_on: i.verified_on,
    owner: names.get(i.owner_user_id) ?? "fact-sheet owner",
    stale: i.verified_on < cutoff,
  }));
  const limits = [...new Set([
    ...donor.limits,
    ...preferenceLogs.flatMap((l) => {
      // A stop-contact limit requires coordinator confirmation before it becomes active.
      if (l.approved?.preference === "email_preferred") return ["Prefers email contact"];
      if (l.approved?.preference === "call_later") return ["Call later"];
      return [];
    }),
  ])];
  const lastOutcome = logs[0]?.approved?.outcome;
  const zones = new Map(await Promise.all([...new Set(followUps.map((f) => f.team_id))].map(async (id) => [id, await teamTimezone(deps, orgId, id)] as const)));
  const talkingPoints = [
    ...(lastOutcome === "voicemail" ? ["A previous attempt reached voicemail; start with a brief introduction."] : []),
    ...(lastOutcome === "rescheduled" ? ["Check the time the donor asked to speak again."] : []),
    ...factItems.filter((i) => !i.stale).slice(0, 2).map((i) => `If asked about the program: ${i.text}`),
  ];
  return {
    donor: {
      id: donor._id,
      first_name: donor.first_name,
      last_name: donor.last_name,
      gift_band: donor.gift_band,
      past_gift_count: donor.past_gift_count,
      last_gift_band: donor.last_gift_band,
      campaign: donor.campaign,
    },
    limits,
    follow_ups: followUps.map((f) => ({ ...f, overdue: isOverdue(f.due_date, nowOf(deps), zones.get(f.team_id) ?? "UTC") })),
    last_logs: logs.map((l) => ({ id: l._id, team_id: l.team_id, caller_id: l.caller_id, fields: l.approved!, author: names.get(l.caller_id) ?? "caller", approved_at: l.approved_at })),
    fact_items: factItems,
    talking_points: talkingPoints,
  };
}
