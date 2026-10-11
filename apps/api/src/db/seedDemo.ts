/**
 * Dev-only synthetic activity so the coordinator dashboard has something to show:
 * approved logs, follow-ups, flags, a pending limit, and warmth ratings, written directly to the
 * P2 collections with the shapes Prompt P2 specifies. Deterministic. Safe to re-run (it replaces
 * the rows it created, marked by `demo: true`). Never runs outside local development.
 */
import { randomUUID } from "node:crypto";
import { collections } from "./collections.ts";
import { createDeps } from "../deps.ts";
import { p2, type CallLogRow, type FlagRow, type FollowUpRow, type LogFieldsDoc, type WarmthRow } from "../services/dashboard/p2Docs.ts";

const GENERATED_DONORS = 60;
const CALL_LOGS = 600;
const CAMPAIGNS = ["Spring Youth Appeal 2026", "Spring Gala 2026", "Summer Camp 2026", "Alumni Renewal 2026"];
const GIFT_BANDS = ["$25-$49", "$50-$99", "$100-$249", "$250-$499", "$500+"];
const REGIONS = [
  { code: "US-PA" }, { code: "US-OH" }, { code: "US-NY" }, { code: "US-CA" }, { code: "US-TX" },
  { code: "US-MA" }, { code: "CA-ON" }, { code: "CA-BC" }, { code: "GB-ENG" }, { code: "AU-NSW" },
];
// Synthetic town names, one list per region.
const TOWNS: Record<string, string[]> = {
  "US-PA": ["Millbrook", "Kestrel Falls", "Harrow Bend"],
  "US-OH": ["Elm Hollow", "Stonebridge"],
  "US-NY": ["Larkspur", "Crow's Ferry", "Briar Gap"],
  "US-CA": ["Sable Point", "Juniper Flats"],
  "US-TX": ["Mesa Verde Ridge", "Coldwater"],
  "US-MA": ["Thornfield", "Gull Harbor"],
  "CA-ON": ["Maple Crossing", "Northmere"],
  "CA-BC": ["Cedar Reach", "Pinecliff"],
  "GB-ENG": ["Ashford Vale", "Redmere"],
  "AU-NSW": ["Coral Bay", "Wattle Creek"],
};
const FIRST_NAMES = ["Avery", "Blair", "Casey", "Devon", "Emery", "Finley", "Gray", "Harper", "Indigo", "Jules", "Kendall", "Lane", "Morgan", "Nico", "Oakley", "Parker"];
const LAST_NAMES = ["Abernathy", "Brightwater", "Calloway", "Dunmore", "Ellery", "Fairweather", "Gilchrist", "Hollis", "Ingram", "Juniper", "Kestrell", "Lowry", "Marrow", "Nyland", "Ostrander", "Quill"];
const teamIdFor = (teams: Array<{ _id: string; name: string }>, n: number) => teams[n % teams.length]!._id;

const deps = await createDeps();
try {
  if (/mongodb\+srv|atlas/i.test(process.env.MONGODB_URI ?? "")) throw new Error("seed:demo is for local development only");
  const c = collections(deps.db);
  const px = p2(deps.db);
  // The organization of the seed coordinator, not whichever organization the database returns first.
  const seedCoordinator = await c.users.findOne({ email: process.env.SEED_COORDINATOR_EMAIL ?? "coordinator@example.org" });
  const membership = seedCoordinator ? await c.memberships.findOne({ user_id: String(seedCoordinator._id), status: "active" }) : null;
  const org = membership ? await c.organizations.findOne({ _id: membership.org_id }) : null;
  if (!org) throw new Error("Run pnpm db:seed first");
  const teams = await c.teams.find({ org_id: org._id, name: { $in: ["Student Callers", "Alumni Callers"] } }).toArray();
  // Synthetic donors spread across regions and campaigns, so the insights have enough cells to show.
  await c.donors.deleteMany({ org_id: org._id, external_id: { $regex: /^demo-/ } });
  const now0 = new Date();
  const generated = Array.from({ length: GENERATED_DONORS }, (_, n) => {
    const region = REGIONS[n % REGIONS.length]!;
    return {
      _id: randomUUID(),
      org_id: org._id,
      external_id: `demo-${String(n + 1).padStart(3, "0")}`,
      team_ids: [teamIdFor(teams, n)],
      first_name: FIRST_NAMES[(n * 3) % FIRST_NAMES.length]!,
      last_name: LAST_NAMES[(n * 7) % LAST_NAMES.length]!,
      spouse_name: null,
      employer: null,
      town: TOWNS[region.code]![n % TOWNS[region.code]!.length]!,
      campaign: CAMPAIGNS[n % CAMPAIGNS.length]!,
      gift_band: GIFT_BANDS[n % GIFT_BANDS.length]!,
      past_gift_count: 1 + (n % 9),
      last_gift_band: GIFT_BANDS[(n + 1) % GIFT_BANDS.length]!,
      limits: n % 13 === 0 ? ["No calls on weekends"] : [],
      timezone_hint: null,
      region: region.code,
      created_at: now0,
      updated_at: now0,
    };
  });
  if (generated.length) await c.donors.insertMany(generated);
  const donors = await c.donors.find({ org_id: org._id }).sort({ external_id: 1 }).toArray();
  if (!teams.length || !donors.length || !seedCoordinator) throw new Error("Run pnpm db:seed first");
  const callerId = String(seedCoordinator._id);

  // The demo coordinator also appears as a caller on the two teams, so volunteer trends have data.
  for (const t of teams) await c.memberships.updateOne({ user_id: callerId, team_id: t._id }, { $set: { org_id: org._id, role: "caller", status: "active" }, $setOnInsert: { _id: randomUUID(), joined_at: new Date() } }, { upsert: true });

  const demo = { org_id: org._id } as const;
  await Promise.all([px.call_logs, px.flags, px.pending_limits, px.follow_ups, px.warmth_ratings].map((col) => (col as never as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({ org_id: org._id, demo: true })));

  const now = Date.now();
  const day = 86_400_000;
  // Reached rates differ by campaign, so the effectiveness view shows a real spread.
  const REACHED_PCT: Record<string, number> = { "Spring Youth Appeal 2026": 52, "Spring Gala 2026": 38, "Summer Camp 2026": 64, "Alumni Renewal 2026": 71 };
  const logs: Array<CallLogRow & { demo: true }> = [];
  for (let i = 0; i < CALL_LOGS; i++) {
    const donor = donors[(i * 7) % donors.length]!;
    const team = teams.find((t) => donor.team_ids.includes(t._id)) ?? teams[0]!;
    const roll = (i * 37 + donor.campaign.length * 11) % 100;
    const reachedPct = REACHED_PCT[donor.campaign] ?? 50;
    const outcome: LogFieldsDoc["outcome"] = roll < reachedPct ? "reached" : roll < reachedPct + 18 ? "voicemail" : roll < reachedPct + 30 ? "no_answer" : roll < reachedPct + 36 ? "declined" : "rescheduled";
    const pref = i % 11 === 0 ? "stop_calls" : i % 7 === 0 ? "email_preferred" : i % 9 === 0 ? "call_later" : "none";
    const approved: LogFieldsDoc = {
      outcome,
      donor_stated_reason: outcome === "reached" ? "Thanked for the gift" : outcome === "voicemail" ? "Left a voicemail" : outcome === "declined" ? "Not this year" : "No answer",
      preference: pref,
      follow_up: { needed: (outcome === "reached" && i % 3 === 0) || outcome === "declined", action: outcome === "declined" || i % 3 === 0 ? "Send the program summary" : "", due_date: null },
      flags: i % 13 === 0 ? ["DISTRESS"] : pref === "stop_calls" ? ["STOP_CONTACT"] : [],
    };
    // Length by outcome. About one call in ten has no recorded length, as in real use.
    const seconds = outcome === "reached" ? 240 + ((i * 53) % 600) : outcome === "voicemail" ? 25 + (i % 40) : outcome === "no_answer" ? 8 + (i % 12) : outcome === "declined" ? 90 + (i % 150) : 60 + (i % 120);
    const at = new Date(now - (i % 120) * day - ((i * 5) % 12) * 2 * 3_600_000);
    logs.push({ _id: randomUUID(), ...demo, demo: true, team_id: team._id, donor_id: donor._id, caller_id: callerId, status: "approved", draft: i % 4 === 0 ? { ...approved, donor_stated_reason: "Draft wording" } : approved, model_draft: "disabled", approved, approved_at: at, corrects_log_id: null, created_at: at, call_seconds: i % 10 === 9 ? null : seconds });
  }
  await px.call_logs.insertMany(logs as never);

  const flagged = logs.filter((l) => l.approved!.flags.length);
  const flags: Array<FlagRow & { demo: true }> = flagged.map((l, i) => ({ _id: randomUUID(), ...demo, demo: true, team_id: l.team_id, donor_id: l.donor_id, log_id: l._id, label: l.approved!.flags[0]!, reason: l.approved!.flags[0] === "DISTRESS" ? "Donor shared distress or a loss during the call." : "Donor asked not to be contacted this way.", status: i % 4 === 3 ? "resolved" : "proposed", created_at: l.created_at, decided_by: null, decided_at: null, decision_note: null }));
  if (flags.length) await px.flags.insertMany(flags as never);

  const stop = logs.find((l) => l.approved!.preference === "stop_calls");
  if (stop) await px.pending_limits.insertOne({ _id: randomUUID(), ...demo, demo: true, team_id: stop.team_id, donor_id: stop.donor_id, log_id: stop._id, limit: "Do not call (donor request)", status: "pending", created_at: stop.created_at, decided_by: null, decided_at: null } as never);

  const fus: Array<FollowUpRow & { demo: true }> = logs
    .filter((l) => l.approved!.follow_up.needed)
    .map((l, i) => {
      const created = l.created_at;
      const status = i % 3 === 0 ? "done" : "open";
      return { _id: randomUUID(), ...demo, demo: true, donor_id: l.donor_id, team_id: l.team_id, owner_user_id: callerId, action: "Send the program summary", due_date: new Date(created.getTime() + (3 + (i % 6)) * day).toISOString().slice(0, 10), status, created_from_log_id: l._id, created_at: created, closed_at: status === "done" ? new Date(created.getTime() + (2 + (i % 4)) * day) : null, last_note: null };
    });
  if (fus.length) await px.follow_ups.insertMany(fus as never);

  const ratings: Array<WarmthRow & { demo: true }> = logs.filter((_, i) => i % 3 === 0).map((l, i) => ({ _id: randomUUID(), ...demo, demo: true, team_id: l.team_id, call_id: l._id, caller_id: callerId, volunteer_score: 3 + (i % 3), llm_score: 2 + (i % 4), llm_reason: "Model's reading of the logged fields.", created_at: l.created_at }));
  if (ratings.length) await px.warmth_ratings.insertMany(ratings as never);

  const patterns = deps.db.collection("patterns");
  await patterns.deleteMany({ org_id: org._id, demo: true });
  await patterns.insertOne({ _id: randomUUID() as never, org_id: org._id, demo: true, title: "Voicemails are common in mid-morning bands", description: "Share of logged calls ending in voicemail, by time band.", segment: "Spring Youth Appeal 2026", denominator: 64, date_from: "2026-08-01", date_to: "2026-10-10", status: "proposed", decided_by: null, decided_at: null, created_at: new Date() });

  console.log(`demo activity: ${logs.length} logs, ${flags.length} flags, ${fus.length} follow-ups, ${ratings.length} ratings`);
} finally {
  await deps.client.close();
}
