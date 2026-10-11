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

const deps = await createDeps();
try {
  if (/mongodb\+srv|atlas/i.test(process.env.MONGODB_URI ?? "")) throw new Error("seed:demo is for local development only");
  const c = collections(deps.db);
  const px = p2(deps.db);
  const org = await c.organizations.findOne({});
  if (!org) throw new Error("Run pnpm db:seed first");
  const teams = await c.teams.find({ org_id: org._id, name: { $in: ["Student Callers", "Alumni Callers"] } }).toArray();
  const donors = await c.donors.find({ org_id: org._id }).sort({ external_id: 1 }).toArray();
  const coordinator = await c.users.findOne({ user_type: "coordinator" });
  if (!teams.length || !donors.length || !coordinator) throw new Error("Run pnpm db:seed first");
  const callerId = String(coordinator._id);

  // The demo coordinator also appears as a caller on the two teams, so volunteer trends have data.
  for (const t of teams) await c.memberships.updateOne({ user_id: callerId, team_id: t._id }, { $set: { org_id: org._id, role: "caller", status: "active" }, $setOnInsert: { _id: randomUUID(), joined_at: new Date() } }, { upsert: true });

  const demo = { org_id: org._id } as const;
  await Promise.all([px.call_logs, px.flags, px.pending_limits, px.follow_ups, px.warmth_ratings].map((col) => (col as never as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({ org_id: org._id, demo: true })));

  const now = Date.now();
  const day = 86_400_000;
  const outcomes: LogFieldsDoc["outcome"][] = ["reached", "reached", "reached", "voicemail", "no_answer", "declined", "reached", "rescheduled"];
  const logs: Array<CallLogRow & { demo: true }> = [];
  for (let i = 0; i < 260; i++) {
    const donor = donors[i % donors.length]!;
    const team = teams.find((t) => donor.team_ids.includes(t._id)) ?? teams[0]!;
    const outcome = outcomes[i % outcomes.length]!;
    const pref = i % 11 === 0 ? "stop_calls" : i % 7 === 0 ? "email_preferred" : i % 9 === 0 ? "call_later" : "none";
    const approved: LogFieldsDoc = {
      outcome,
      donor_stated_reason: outcome === "reached" ? "Thanked for the gift" : outcome === "voicemail" ? "Left a voicemail" : "No answer",
      preference: pref,
      follow_up: { needed: i % 5 === 0, action: i % 5 === 0 ? "Send the program summary" : "", due_date: null },
      flags: i % 13 === 0 ? ["DISTRESS"] : pref === "stop_calls" ? ["STOP_CONTACT"] : [],
    };
    const at = new Date(now - (i % 80) * day - (i % 8) * 3_600_000 * 2);
    logs.push({ _id: randomUUID(), ...demo, demo: true, team_id: team._id, donor_id: donor._id, caller_id: callerId, status: "approved", draft: i % 4 === 0 ? { ...approved, donor_stated_reason: "Draft wording" } : approved, model_draft: "disabled", approved, approved_at: at, corrects_log_id: null, created_at: at });
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
