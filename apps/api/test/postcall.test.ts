import type { CallLogDoc, DonorDoc, FactSheetDoc, LogFields } from "@sc/shared";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { collections } from "../src/db/collections.ts";
import { Client, harness, inviteAndAccept, signUpCoordinator, type Harness } from "./helpers.ts";

const baseFields: LogFields = { outcome: "reached", donor_stated_reason: "Thanked for the gift", preference: "none", follow_up: { needed: false, action: "", due_date: null }, flags: [] };

describe("pre-call and post-call platform", () => {
  let h: Harness;
  let coord: Client;
  let caller: Client;
  let outsider: Client;
  let orgId: string;
  let teamId: string;
  let donorId: string;
  let logId: string;
  let callerId: string;

  beforeAll(async () => {
    h = await harness();
    const owner = await signUpCoordinator(h, "post-coord@example.org", "Postcall Synthetic Org");
    coord = owner.client; orgId = owner.orgId; teamId = owner.rootTeamId;
    const invited = await inviteAndAccept(h, coord, teamId, "post-caller@example.org");
    caller = invited.client;
    callerId = (await caller.get("/api/me")).json.user.id;
    const other = await signUpCoordinator(h, "outside@example.org", "Another Synthetic Org");
    outsider = other.client;
    donorId = randomUUID(); logId = randomUUID();
    const now = new Date("2026-10-11T18:00:00Z");
    h.clock.now = now;
    const donor: DonorDoc = { _id: donorId, org_id: orgId, external_id: "synthetic-post-1", team_ids: [teamId], first_name: "Rosalind", last_name: "Featherstone", spouse_name: null, employer: null, town: null, campaign: "Spring Youth Appeal 2026", gift_band: "$100-$249", past_gift_count: 3, last_gift_band: "$100-$249", limits: ["No evening calls"], timezone_hint: null, created_at: now, updated_at: now };
    const c = collections(h.deps.db);
    await c.donors.insertOne(donor);
    const sheet: FactSheetDoc = { _id: randomUUID(), org_id: orgId, name: "spring", items: [{ id: "spring-fact", text: "The synthetic mentoring program meets weekly.", source: "Synthetic program report", verified_on: "2026-09-15", owner_user_id: (await coord.get("/api/me")).json.user.id, status: "approved" }, { id: "stale-fact", text: "An older synthetic program fact.", source: "Older synthetic report", verified_on: "2024-09-15", owner_user_id: callerId, status: "approved" }, { id: "draft-fact", text: "Unapproved", source: "Draft", verified_on: "2026-09-15", owner_user_id: callerId, status: "draft" }], created_at: now };
    const otherSheet: FactSheetDoc = { _id: randomUUID(), org_id: orgId, name: "other", items: [{ id: "other-fact", text: "Different campaign", source: "Synthetic", verified_on: "2026-09-15", owner_user_id: callerId, status: "approved" }], created_at: now };
    await c.fact_sheets.insertMany([sheet, otherSheet]);
    await c.campaigns.insertMany([
      { _id: randomUUID(), org_id: orgId, name: donor.campaign, description: "", fact_sheet_ids: [sheet._id] },
      { _id: randomUUID(), org_id: orgId, name: "Other Campaign", description: "", fact_sheet_ids: [otherSheet._id] },
    ]);
    const log: CallLogDoc = { _id: logId, org_id: orgId, team_id: teamId, donor_id: donorId, caller_id: callerId, status: "draft", draft: baseFields, model_draft: "disabled", redaction_counts: {}, approved: null, approved_at: null, idempotency_key: null, corrects_log_id: null, created_at: now };
    await c.call_logs.insertOne(log);
  });
  afterAll(async () => { await h?.close(); });

  it("scopes the brief, facts and log access to the donor's team", async () => {
    const brief = await caller.get(`/api/donors/${donorId}/brief`);
    expect(brief.status).toBe(200);
    expect(brief.json.fact_items.map((i: { id: string }) => i.id)).toEqual(["spring-fact", "stale-fact"]);
    expect(brief.json.fact_items[0].source).toBe("Synthetic program report");
    expect(brief.json.fact_items[0].stale).toBe(false);
    expect(brief.json.fact_items[1].stale).toBe(true);
    expect(brief.json.limits).toContain("No evening calls");
    expect(await outsider.get(`/api/donors/${donorId}/brief`)).toMatchObject({ status: 404 });
    expect(await outsider.get(`/api/logs/${logId}`)).toMatchObject({ status: 404 });

    const team = await coord.post("/api/teams", { name: "Other Synthetic Team", focus: "", parent_team_id: teamId });
    expect(team.status).toBe(201);
    const otherTeamId = team.json.team._id as string;
    const otherDonorId = randomUUID();
    const otherLogId = randomUUID();
    await collections(h.deps.db).donors.insertOne({ _id: otherDonorId, org_id: orgId, external_id: "synthetic-other-team", team_ids: [otherTeamId], first_name: "Harriet", last_name: "Penwarden", spouse_name: null, employer: null, town: null, campaign: "Other Campaign", gift_band: "$50-$99", past_gift_count: 1, last_gift_band: "$50-$99", limits: [], timezone_hint: null, created_at: h.clock.now, updated_at: h.clock.now });
    const coordId = (await coord.get("/api/me")).json.user.id as string;
    await collections(h.deps.db).call_logs.insertOne({ _id: otherLogId, org_id: orgId, team_id: otherTeamId, donor_id: otherDonorId, caller_id: coordId, status: "approved", draft: baseFields, model_draft: "disabled", redaction_counts: {}, approved: baseFields, approved_at: h.clock.now, idempotency_key: "other-team-log", corrects_log_id: null, created_at: h.clock.now });
    await collections(h.deps.db).warmth_ratings.insertOne({ _id: randomUUID(), org_id: orgId, team_id: otherTeamId, call_id: otherLogId, caller_id: coordId, volunteer_score: 3, llm_score: null, llm_reason: null, llm_status: "disabled", idempotency_key: "other-team-warmth", created_at: h.clock.now });
    expect((await caller.get(`/api/donors/${otherDonorId}/brief`)).status).toBe(404);
    expect((await caller.get(`/api/logs/${otherLogId}`)).status).toBe(404);
    expect((await caller.get(`/api/logs/${otherLogId}/warmth`)).status).toBe(404);
  });

  it("rejects unknown keys and identifiers, then approves once with flags, pending limit and follow-up", async () => {
    const path = `/api/logs/${logId}/approve`;
    const fields: LogFields = { ...baseFields, preference: "stop_calls", flags: ["STOP_CONTACT"], follow_up: { needed: true, action: "Send a confirmation by email", due_date: "2026-10-12" } };
    const payload = { idempotency_key: "approve-postcall-1", client_version: "test", fields };
    expect((await caller.post(path, { ...payload, note: "never store" })).status).toBe(400);
    const pii = await caller.post(path, { ...payload, fields: { ...fields, donor_stated_reason: "Call 814-555-0142" } });
    expect(pii.status).toBe(422);
    expect(pii.json).toEqual({ error: "pii_detected", counts: { PHONE: 1 } });
    expect((await caller.post(path, { ...payload, fields: { ...fields, follow_up: { ...fields.follow_up, action: "Call 814-555-0142" } } })).status).toBe(422);
    const approved = await caller.post(path, payload);
    expect(approved.status).toBe(200);
    expect(approved.text).not.toContain("never store");
    const c = collections(h.deps.db);
    expect((await c.call_logs.findOne({ _id: logId, org_id: orgId }))?.approved).toEqual(fields);
    const persisted = JSON.stringify(await c.call_logs.findOne({ _id: logId, org_id: orgId }));
    expect(persisted).not.toContain("814-555-0142");
    expect(persisted).not.toContain("never store");
    expect(JSON.stringify(await c.seed_runs.find({ org_id: orgId }).toArray())).not.toContain("never store");
    expect(await c.call_flags.countDocuments({ org_id: orgId, log_id: logId })).toBe(1);
    expect(await c.pending_limits.countDocuments({ org_id: orgId, log_id: logId, status: "pending" })).toBe(1);
    expect(await c.follow_ups.countDocuments({ org_id: orgId, created_from_log_id: logId })).toBe(1);
    expect((await caller.post(path, payload)).status).toBe(200);
    expect(await h.deps.db.collection("audit_log").countDocuments({ org_id: orgId, action: "log.approve", target_id: logId })).toBe(1);
    expect(await c.donors.findOne({ _id: donorId, org_id: orgId })).not.toMatchObject({ limits: expect.arrayContaining(["Do not call"]) });
  });

  it("requires coordinator decisions and scopes follow-up actions", async () => {
    const c = collections(h.deps.db);
    const flag = await c.call_flags.findOne({ org_id: orgId, log_id: logId });
    const limit = await c.pending_limits.findOne({ org_id: orgId, log_id: logId });
    const fu = await c.follow_ups.findOne({ org_id: orgId, created_from_log_id: logId });
    expect(flag && limit && fu).toBeTruthy();
    const queue = await coord.get("/api/coordinator/queue");
    expect(queue.status).toBe(200);
    expect(queue.json.flags[0]).toMatchObject({ label: "STOP_CONTACT", log_id: logId, log: { preference: "stop_calls" } });
    expect(queue.json.pending_limits[0].limit).toBe("Do not call");
    expect((await caller.post(`/api/flags/${flag!._id}/approve`)).status).toBe(403);
    expect((await coord.post(`/api/flags/${flag!._id}/approve`)).status).toBe(200);
    expect((await coord.post(`/api/pending-limits/${limit!._id}/approve`)).status).toBe(200);
    expect((await c.donors.findOne({ _id: donorId, org_id: orgId }))?.limits).toContain("Do not call");
    expect((await caller.post(`/api/follow-ups/${fu!._id}/handoff`, { idempotency_key: "handoff-0001", to_user_id: "nobody" })).status).toBe(400);
    expect((await caller.post(`/api/follow-ups/${fu!._id}/complete`, { idempotency_key: "complete-0001" })).status).toBe(200);
    expect((await caller.post(`/api/follow-ups/${fu!._id}/complete`, { idempotency_key: "complete-0001" })).status).toBe(200);
    expect(await h.deps.db.collection("audit_log").countDocuments({ org_id: orgId, action: "follow_up.complete", target_id: fu!._id })).toBe(1);
    expect((await outsider.post(`/api/follow-ups/${fu!._id}/cancel`, { idempotency_key: "cancel-0001", note: "test" })).status).toBe(404);
  });

  it("hands off only within the same team with a note and preserves idempotent results", async () => {
    const coordId = (await coord.get("/api/me")).json.user.id as string;
    const id = randomUUID();
    await collections(h.deps.db).follow_ups.insertOne({ _id: id, org_id: orgId, donor_id: donorId, team_id: teamId, owner_user_id: callerId, action: "Send a synthetic summary", due_date: "2026-10-10", status: "open", created_from_log_id: logId, created_at: h.clock.now, closed_at: null, action_keys: [], action_results: [], last_note: null });
    expect((await caller.get(`/api/follow-ups/${id}`)).json.follow_up.overdue).toBe(true);
    expect((await caller.post(`/api/follow-ups/${id}/cancel`, { idempotency_key: "cancel-0002", note: "No longer needed" })).status).toBe(403);
    const body = { idempotency_key: "handoff-0002", to_user_id: coordId, note: "Coordinator will send the summary" };
    const first = await caller.post(`/api/follow-ups/${id}/handoff`, body);
    expect(first.status).toBe(200);
    expect(first.json.result.owner_user_id).toBe(coordId);
    const repeat = await caller.post(`/api/follow-ups/${id}/handoff`, body);
    expect(repeat.status).toBe(200);
    expect(repeat.json.result).toEqual(first.json.result);
    expect(await h.deps.db.collection("audit_log").countDocuments({ org_id: orgId, action: "follow_up.handoff", target_id: id })).toBe(1);
    expect((await coord.post(`/api/follow-ups/${id}/complete`, { idempotency_key: "complete-0002" })).status).toBe(200);
  });

  it("reserves a content-free log and links corrections to an approved entry", async () => {
    const call_id = randomUUID();
    const path = `/api/donors/${donorId}/logs/start`;
    expect((await outsider.post(path, { call_id })).status).toBe(404);
    const started = await caller.post(path, { call_id, corrects_log_id: logId });
    expect(started.status).toBe(201);
    expect((await caller.post(path, { call_id, corrects_log_id: logId })).status).toBe(200);
    const stored = await collections(h.deps.db).call_logs.findOne({ _id: call_id, org_id: orgId });
    expect(stored).toMatchObject({ status: "draft", corrects_log_id: logId, approved: null });
    expect(JSON.stringify(stored)).not.toContain("note");
  });

  it("keeps caller and model warmth separate and prompts on a two-point gap", async () => {
    h.deps.env.AWS_REGION = "us-east-1";
    h.deps.env.BEDROCK_MODEL_ID = "mock-model";
    const send = vi.fn(async () => ({ output: { message: { content: [{ text: '{"score":3,"reason":"Neutral exchange"}' }] } } }));
    h.deps.bedrock = { send } as unknown as BedrockRuntimeClient;
    const path = `/api/logs/${logId}/warmth`;
    const rating = await caller.post(path, { idempotency_key: "warmth-postcall-1", score: 1 });
    expect(rating.status).toBe(201);
    expect(rating.json.warmth).toMatchObject({ volunteer_score: 1, llm_score: 3, gap: 2, discussion_prompt: "Caller and model read this differently. What did you see?" });
    expect((await caller.post(path, { idempotency_key: "warmth-postcall-1", score: 1 })).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(rating.json.warmth).not.toHaveProperty("average");
    expect((await outsider.get(path)).status).toBe(404);

    const nearLogId = randomUUID();
    await collections(h.deps.db).call_logs.insertOne({ _id: nearLogId, org_id: orgId, team_id: teamId, donor_id: donorId, caller_id: callerId, status: "approved", draft: baseFields, model_draft: "disabled", redaction_counts: {}, approved: baseFields, approved_at: h.clock.now, idempotency_key: "near-approved-key", corrects_log_id: null, created_at: h.clock.now });
    send.mockResolvedValueOnce({ output: { message: { content: [{ text: '{"score":4,"reason":"Warm exchange"}' }] } } });
    const near = await caller.post(`/api/logs/${nearLogId}/warmth`, { idempotency_key: "warmth-postcall-2", score: 3 });
    expect(near.json.warmth).toMatchObject({ gap: 1, discussion_prompt: null });

    const coordId = (await coord.get("/api/me")).json.user.id as string;
    const anotherLogId = randomUUID();
    await collections(h.deps.db).call_logs.insertOne({ _id: anotherLogId, org_id: orgId, team_id: teamId, donor_id: donorId, caller_id: coordId, status: "approved", draft: baseFields, model_draft: "disabled", redaction_counts: {}, approved: baseFields, approved_at: h.clock.now, idempotency_key: "other-approved-key", corrects_log_id: null, created_at: h.clock.now });
    await collections(h.deps.db).warmth_ratings.insertOne({ _id: randomUUID(), org_id: orgId, team_id: teamId, call_id: anotherLogId, caller_id: coordId, volunteer_score: 4, llm_score: null, llm_reason: null, llm_status: "disabled", idempotency_key: "other-warmth-key", created_at: h.clock.now });
    expect((await caller.get(`/api/logs/${anotherLogId}/warmth`)).status).toBe(404);
  });

  it("returns only the three newest approved log entries", async () => {
    const c = collections(h.deps.db);
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      const date = new Date(`2026-10-${String(index + 12).padStart(2, "0")}T12:00:00Z`);
      await c.call_logs.insertOne({ _id: id, org_id: orgId, team_id: teamId, donor_id: donorId, caller_id: callerId, status: "approved", draft: baseFields, model_draft: "disabled", redaction_counts: {}, approved: baseFields, approved_at: date, idempotency_key: `history-key-${index}`, corrects_log_id: null, created_at: date });
    }
    const brief = await caller.get(`/api/donors/${donorId}/brief`);
    expect(brief.json.last_logs.map((l: { id: string }) => l.id)).toEqual([ids[3], ids[2], ids[1]]);
    expect(brief.json.last_logs[0].author).toBeTruthy();
  });
});
