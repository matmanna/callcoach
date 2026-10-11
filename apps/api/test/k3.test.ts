import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { p2, type CallLogRow, type FollowUpRow, type LogFieldsDoc } from "../src/services/dashboard/p2Docs.ts";
import { Client, harness, inviteAndAccept, seedFile, signUpCoordinator, type Harness } from "./helpers.ts";

let h: Harness;
let coord: Client;
let orgId: string;
let student: string;
let alumni: string;
let caller: Client;
let callerId: string;
let coord2: Client; // coordinator of the Student team only
let coord3: Client; // second org-wide coordinator (for second-approver tests)
let donors: Array<{ _id: string; external_id: string; team_ids: string[]; first_name: string; last_name: string }>;
const ago = (days: number) => new Date(h.clock.now.getTime() - days * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const fields = (o: Partial<LogFieldsDoc> = {}): LogFieldsDoc => ({ outcome: "reached", donor_stated_reason: "Thanked for the gift", preference: "none", follow_up: { needed: false, action: "", due_date: null }, flags: [], ...o });

async function addLogs(n: number, o: { team: string; caller: string; donorIdx?: number; daysAgo?: number; fields?: Partial<LogFieldsDoc>; draftDiffers?: boolean }) {
  const docs: CallLogRow[] = Array.from({ length: n }, (_, i) => {
    const donor = donors[(o.donorIdx ?? 0) + (i % 2)]!;
    const approved = fields(o.fields);
    return {
      _id: randomUUID(),
      org_id: orgId,
      team_id: o.team,
      donor_id: donor._id,
      caller_id: o.caller,
      status: "approved",
      draft: o.draftDiffers ? fields({ donor_stated_reason: "Different draft" }) : approved,
      model_draft: "disabled",
      approved,
      approved_at: ago(o.daysAgo ?? 3),
      corrects_log_id: null,
      created_at: ago(o.daysAgo ?? 3),
    };
  });
  if (docs.length) await p2(h.deps.db).call_logs.insertMany(docs);
  return docs;
}

beforeAll(async () => {
  h = await harness();
  const s = await signUpCoordinator(h, "k3-coord@example.org", "K3 Org");
  coord = s.client;
  orgId = s.orgId;
  student = (await coord.post("/api/teams", { name: "Student Callers", focus: "students" })).json.team._id;
  alumni = (await coord.post("/api/teams", { name: "Alumni Callers", focus: "alumni" })).json.team._id;
  const imp = await coord.post("/api/imports/donors/commit", { file_name: "donors.csv", content: seedFile("donors.csv") });
  expect(imp.json.seed_run.accepted_count).toBe(10);
  await coord.post("/api/imports/gifts/commit", { file_name: "gifts.csv", content: seedFile("gifts.csv") });
  donors = await h.deps.db.collection("donors").find({ org_id: orgId }).sort({ external_id: 1 }).toArray() as never;
  const v = await inviteAndAccept(h, coord, student, "k3-caller@example.org");
  caller = v.client;
  callerId = (await caller.get("/api/me")).json.user.id;
  coord2 = (await inviteAndAccept(h, coord, student, "k3-coord2@example.org", "coordinator")).client;
  coord3 = (await inviteAndAccept(h, coord, s.rootTeamId, "k3-coord3@example.org", "coordinator")).client;
}, 90_000);
afterAll(async () => h?.close());

describe("access", () => {
  const paths = ["/api/dashboard/overview", "/api/contacts", "/api/volunteers", "/api/calls", "/api/queue", "/api/follow-ups", "/api/knowledge", "/api/insights/charts?kind=calls_per_week", "/api/insights/map", "/api/audit", "/api/patterns"];
  it.each(paths)("a caller gets 403 on %s", async (p) => {
    expect((await caller.get(p)).status).toBe(403);
  });
  it("unauthenticated -> 401", async () => {
    expect((await new Client(h).get("/api/dashboard/overview")).status).toBe(401);
  });
  it("a team coordinator cannot read another team's contacts or volunteers", async () => {
    const mine = (await coord2.get("/api/contacts?limit=100")).json;
    expect(mine.total).toBe(5);
    expect(mine.contacts.every((c: { team_names: string[] }) => c.team_names.every((n) => n === "Student Callers"))).toBe(true);
    const other = donors.find((d) => d.team_ids.includes(alumni))!;
    expect((await coord2.get(`/api/contacts/${other._id}`)).status).toBe(404);
    expect((await coord2.get(`/api/contacts/${other._id}/history`)).status).toBe(404);
    expect((await coord2.get(`/api/volunteers?team_id=${alumni}`)).status).toBe(404);
    const vols = (await coord2.get("/api/volunteers")).json.volunteers as Array<{ team: string }>;
    expect(vols.length).toBeGreaterThan(0);
    expect(vols.every((v) => v.team === "Student Callers")).toBe(true);
    expect((await coord2.get(`/api/contacts?team_id=${alumni}`)).status).toBe(404);
  });
  it("another org gets nothing", async () => {
    const other = await signUpCoordinator(h, "k3-other@example.org", "Other Org");
    expect((await other.client.get(`/api/contacts/${donors[0]!._id}`)).status).toBe(404);
    expect((await other.client.get("/api/contacts")).json.total).toBe(0);
  });
});

describe("contacts and dossier", () => {
  it("filters, sorts, and paginates on the server", async () => {
    const page1 = (await coord.get("/api/contacts?limit=4&sort=name")).json;
    expect(page1.total).toBe(10);
    expect(page1.contacts).toHaveLength(4);
    expect(page1.next_cursor).toBe("4");
    const page3 = (await coord.get(`/api/contacts?limit=4&cursor=8`)).json;
    expect(page3.contacts).toHaveLength(2);
    expect(page3.next_cursor).toBeNull();
    expect((await coord.get("/api/contacts?has_limits=true")).json.total).toBe(4);
    expect((await coord.get("/api/contacts?never_contacted=true")).json.total).toBe(10);
    expect((await coord.get("/api/contacts?sort=score")).status).toBe(400);
  });

  it("editing a stated limit creates a version and keeps the old one with its date", async () => {
    const d = donors.find((x) => x.external_id === "d-202")!;
    const before = (await coord.get(`/api/contacts/${d._id}`)).json;
    expect(before.limits).toHaveLength(1);
    expect(before.limits[0].version).toBe(1);
    const key = before.limits[0].key;
    const r = await coord.patch(`/api/contacts/${d._id}/limits`, { action: "edit", key, value: "Mail and email only", source: "Donor, by letter", stated_on: "2026-09-30" });
    expect(r.status).toBe(200);
    const after = (await coord.get(`/api/contacts/${d._id}`)).json;
    expect(after.limits).toEqual([expect.objectContaining({ value: "Mail and email only", version: 2, source: "Donor, by letter", stated_on: "2026-09-30" })]);
    const hist = (await coord.get(`/api/contacts/${d._id}/history`)).json.versions as Array<{ version: number; value: string; status: string }>;
    expect(hist.map((v) => [v.version, v.value, v.status]).sort()).toEqual([[1, "Mail only", "superseded"], [2, "Mail and email only", "active"]]);
    // The brief-facing donor record mirrors the active limits.
    expect((await h.deps.db.collection("donors").findOne({ _id: d._id as never }))?.limits).toEqual(["Mail and email only"]);
    expect((await coord.patch(`/api/contacts/${d._id}/limits`, { action: "edit", key, value: "x", source: "", stated_on: "2026-09-30" })).status).toBe(400);
    const pref = await coord.post(`/api/contacts/${d._id}/preferences`, { value: "Prefers morning calls", source: "Donor, by phone", stated_on: "2026-10-01" });
    expect(pref.status).toBe(201);
    expect((await coord.get(`/api/contacts/${d._id}`)).json.preferences).toHaveLength(1);
  });

  it("deleting a dossier needs typed confirmation, removes approved entries, writes one audit row", async () => {
    const d = donors.find((x) => x.external_id === "d-209")!;
    const log = (await addLogs(1, { team: alumni, caller: callerId, donorIdx: 9, fields: { preference: "stop_calls" } }))[0]!;
    await p2(h.deps.db).flags.insertOne({ _id: randomUUID(), org_id: orgId, team_id: alumni, donor_id: d._id, log_id: log._id, label: "STOP_CONTACT", reason: "r", status: "proposed", created_at: ago(1), decided_by: null, decided_at: null, decision_note: null });
    const auditBefore = await h.deps.db.collection("audit_log").countDocuments({ org_id: orgId, action: "contact.delete" });
    expect((await coord.req("DELETE", `/api/contacts/${d._id}`, { confirm_external_id: "wrong" })).status).toBe(422);
    expect(await h.deps.db.collection("donors").countDocuments({ _id: d._id as never })).toBe(1);
    expect((await coord2.req("DELETE", `/api/contacts/${d._id}`, { confirm_external_id: "d-209" })).status).toBe(404); // not on coord2's team
    const ok = await coord.req("DELETE", `/api/contacts/${d._id}`, { confirm_external_id: "d-209" });
    expect(ok.status).toBe(200);
    expect(ok.json.deleted.call_logs).toBe(1);
    expect((await coord.get(`/api/contacts/${d._id}`)).status).toBe(404);
    expect(await p2(h.deps.db).call_logs.countDocuments({ donor_id: d._id })).toBe(0);
    expect(await p2(h.deps.db).flags.countDocuments({ donor_id: d._id })).toBe(0);
    const audit = await h.deps.db.collection("audit_log").find({ org_id: orgId, action: "contact.delete" }).toArray();
    expect(audit.length).toBe(auditBefore + 1);
    expect(JSON.stringify(audit)).not.toMatch(/d-209|Odessa|Pemberton/);
  });
});

describe("volunteers: no rankings", () => {
  it.each(["score", "rank", "performance", "top", "calls_logged_30d", "calls"])("rejects sort=%s", async (key) => {
    const r = await coord.get(`/api/volunteers?sort=${key}`);
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("sort_not_allowed");
  });
  it("accepts name, team, joined, last_activity; response has no rank field", async () => {
    for (const key of ["name", "team", "joined", "last_activity"]) expect((await coord.get(`/api/volunteers?sort=${key}`)).status).toBe(200);
    const body = (await coord.get("/api/volunteers")).json;
    expect(JSON.stringify(body)).not.toMatch(/"(rank|score|top|performance)[a-z_]*"/i);
    expect(Object.keys(body.volunteers[0]).sort()).toEqual(["calls_logged_30d", "email", "follow_ups_open", "joined_at", "last_activity", "membership_id", "name", "overdue", "role", "status", "team", "team_focus", "team_id", "user_id"]);
  });
  it("trend shows the volunteer's own series with a team baseline, labelled for discussion", async () => {
    await addLogs(2, { team: student, caller: callerId, daysAgo: 2, draftDiffers: true });
    const t = (await coord.get(`/api/volunteers/${callerId}/trend`)).json;
    expect(t.label).toBe("For discussion with this volunteer, not an evaluation.");
    expect(t.series).toHaveLength(12);
    expect(t.series.reduce((n: number, w: { calls_logged: number }) => n + w.calls_logged, 0)).toBeGreaterThanOrEqual(2);
    expect(t.series.reduce((n: number, w: { logs_edited_before_approval: number }) => n + w.logs_edited_before_approval, 0)).toBeGreaterThanOrEqual(2);
    // Baseline cells under 5 are suppressed, with no number.
    expect(JSON.stringify(t.team_baseline)).not.toMatch(/"n":[1-4]\b/);
    expect(t.team_baseline.some((w: { calls_logged: { suppressed?: boolean } }) => w.calls_logged.suppressed)).toBe(true);
    expect((await coord2.get(`/api/volunteers/${(await coord.get("/api/me")).json.user.id}/trend?team_id=${alumni}`)).status).toBe(404);
  });
});

describe("minimum cell size: suppressed server-side", () => {
  const KINDS = ["calls_per_week", "follow_up_completion", "preference_reports", "overdue_trend", "warmth_distribution", "time_bands"];
  beforeAll(async () => {
    // Small data: 3 logs of each outcome at a time, 3 follow-ups, 2 ratings.
    await addLogs(3, { team: student, caller: callerId, daysAgo: 10, fields: { outcome: "voicemail", preference: "email_preferred" } });
    await addLogs(3, { team: student, caller: callerId, daysAgo: 11, fields: { outcome: "declined", preference: "stop_calls" } });
    const fus: FollowUpRow[] = Array.from({ length: 3 }, (_, i) => ({ _id: randomUUID(), org_id: orgId, donor_id: donors[i]!._id, team_id: student, owner_user_id: callerId, action: "Send the program summary", due_date: ymd(ago(20)), status: "open", created_from_log_id: "x", created_at: ago(30), closed_at: null, last_note: null }));
    await p2(h.deps.db).follow_ups.insertMany(fus);
    const logs = await p2(h.deps.db).call_logs.find({ org_id: orgId }).limit(2).toArray();
    await p2(h.deps.db).warmth_ratings.insertMany(logs.map((l) => ({ _id: randomUUID(), org_id: orgId, team_id: student, call_id: l._id, caller_id: callerId, volunteer_score: 4, llm_score: 2, llm_reason: "r", created_at: ago(5) })));
  });

  it.each(KINDS)("%s: no count under 5 anywhere in the response", async (kind) => {
    const r = await coord.get(`/api/insights/charts?kind=${kind}`);
    expect(r.status).toBe(200);
    // Every shown cell is {"n": >=5}; a suppressed cell is {"suppressed":true} with no number.
    for (const m of r.text.matchAll(/"n":(\d+)/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(5);
    expect(r.text).toContain('"suppressed":true');
    expect(r.text).not.toMatch(/"(count|calls|logs|created|completed|overdue)":\d/);
  });

  it("a cell at exactly 5 is shown, under 5 is suppressed, and totals hide when a cell is suppressed", async () => {
    await addLogs(5, { team: alumni, caller: callerId, donorIdx: 6, daysAgo: 4, fields: { outcome: "no_answer" } });
    const r = (await coord.get("/api/insights/charts?kind=calls_per_week")).json;
    const alumniRow = r.rows.find((x: { team: string; outcomes: Record<string, { n?: number }> }) => x.team === "Alumni Callers" && x.outcomes.no_answer?.n === 5);
    expect(alumniRow).toBeTruthy();
    expect(alumniRow.outcomes.reached).toEqual({ suppressed: true });
    expect(alumniRow.total).toEqual({ suppressed: true });
  });

  it("map: region cells and team coverage are suppressed under 5, with no coordinates", async () => {
    const r = await coord.get("/api/insights/map?level=region");
    expect(r.status).toBe(200);
    for (const m of r.text.matchAll(/"n":(\d+)/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(5);
    expect(r.text).toContain('"suppressed":true');
    expect(r.text).not.toMatch(/lat|lng|lon|coordinates|street/i);
    expect((await coord.get("/api/insights/map?level=country")).status).toBe(200);
  });

  it("compare: segments side by side with donor mix, suppressed under 5", async () => {
    const r = await coord.get(`/api/insights/compare?kind=team&a=${student}&b=${alumni}`);
    expect(r.status).toBe(200);
    for (const m of r.text.matchAll(/"n":(\d+)/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(5);
    const seg = r.json.segments;
    expect(seg).toHaveLength(2);
    expect(Object.keys(seg[0].donor_mix).sort()).toEqual(["first_time", "lapsed", "recent"]);
    expect((await coord.get(`/api/insights/compare?kind=team&a=${student}&b=${student}`)).status).toBe(400);
    expect((await coord2.get(`/api/insights/compare?kind=team&a=${student}&b=${alumni}`)).status).toBe(404);
  });

  it("every insight response carries a denominator and a date range, and uses outcome language", async () => {
    for (const kind of KINDS) {
      const r = (await coord.get(`/api/insights/charts?kind=${kind}&from=2026-01-01&to=2026-12-31`)).json;
      expect(r.range).toEqual({ from: "2026-01-01", to: "2026-12-31" });
      expect(r.denominator.what).toBeTruthy();
      expect(r.denominator.count).toBeTruthy();
      expect(JSON.stringify(r)).not.toMatch(/retention|revenue|drives|causes|caused|score\b|rank/i);
    }
    expect((await coord.get("/api/insights/charts?kind=bogus")).status).toBe(400);
    expect((await coord.get("/api/insights/charts?kind=calls_per_week&from=nope")).status).toBe(400);
  });

  it("no insight response contains donor-level data", async () => {
    const urls = [...KINDS.map((k) => `/api/insights/charts?kind=${k}`), "/api/insights/map", "/api/insights/campaigns", `/api/insights/compare?kind=team&a=${student}&b=${alumni}`];
    for (const u of urls) {
      const text = (await coord.get(u)).text;
      for (const d of donors) {
        expect(text).not.toContain(d.external_id);
        expect(text).not.toContain(d.last_name);
        expect(text).not.toContain(d._id);
      }
    }
  });
});

describe("coordinator queue", () => {
  let flagIds: string[];
  beforeAll(async () => {
    const log = (await addLogs(1, { team: student, caller: callerId, donorIdx: 0, fields: { flags: ["DISTRESS", "STOP_CONTACT"] } }))[0]!;
    flagIds = ["DISTRESS", "STOP_CONTACT", "OFF_SCRIPT_CLAIM"].map(() => randomUUID());
    await p2(h.deps.db).flags.insertMany(
      (["DISTRESS", "STOP_CONTACT", "OFF_SCRIPT_CLAIM"] as const).map((label, i) => ({ _id: flagIds[i]!, org_id: orgId, team_id: student, donor_id: log.donor_id, log_id: log._id, label, reason: `${label} reason`, status: "proposed" as const, created_at: ago(3 - i), decided_by: null, decided_at: null, decision_note: null })),
    );
  });
  it("lists proposed flags with the model note, oldest red first", async () => {
    const q = (await coord.get("/api/queue")).json;
    expect(q.note).toBe("Suggested by model, needs review.");
    expect(q.items.map((i: { label: string }) => i.label)).toEqual(["DISTRESS", "STOP_CONTACT", "OFF_SCRIPT_CLAIM"]);
    expect(q.items.every((i: { red: boolean }) => i.red)).toBe(true);
  });
  it("override without a note is rejected", async () => {
    const r = await coord.post(`/api/queue/${flagIds[0]}/decision`, { action: "override" });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("note_required");
    expect((await p2(h.deps.db).flags.findOne({ _id: flagIds[0]! }))?.status).toBe("proposed");
  });
  it("batch resolve on red labels is rejected and changes nothing", async () => {
    const r = await coord.post("/api/queue/batch-resolve", { ids: flagIds });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("batch_resolve_not_allowed_for_red_labels");
    expect(await p2(h.deps.db).flags.countDocuments({ _id: { $in: flagIds }, status: "proposed" })).toBe(3);
  });
  it("resolving a red label needs a note and writes exactly one audit row", async () => {
    expect((await coord.post(`/api/queue/${flagIds[0]}/decision`, { action: "resolve" })).status).toBe(422);
    const r = await coord.post(`/api/queue/${flagIds[0]}/decision`, { action: "resolve", note: "Called the donor's family; acknowledged." });
    expect(r.status).toBe(200);
    const audit = await h.deps.db.collection("audit_log").find({ target_id: flagIds[0] }).toArray();
    expect(audit.map((a) => a.action)).toEqual(["flag.resolve"]);
    expect((await coord.post(`/api/queue/${flagIds[0]}/decision`, { action: "resolve", note: "again" })).status).toBe(409);
    expect((await coord.post(`/api/queue/${flagIds[1]}/decision`, { action: "override", note: "Not a request to stop." })).status).toBe(200);
    expect((await p2(h.deps.db).flags.findOne({ _id: flagIds[1]! }))?.status).toBe("overridden");
  });
  it("another team's coordinator cannot decide a flag outside their scope", async () => {
    const stray = randomUUID();
    await p2(h.deps.db).flags.insertOne({ _id: stray, org_id: orgId, team_id: alumni, donor_id: donors[0]!._id, log_id: "x", label: "DISTRESS", reason: "r", status: "proposed", created_at: ago(1), decided_by: null, decided_at: null, decision_note: null });
    expect((await coord2.post(`/api/queue/${stray}/decision`, { action: "approve" })).status).toBe(404);
  });
  it("approving a pending limit writes a new limit version; follow-up cancel needs a note", async () => {
    const d = donors[3]!;
    const log = (await addLogs(1, { team: student, caller: callerId, donorIdx: 3, fields: { preference: "stop_calls" } }))[0]!;
    const pid = randomUUID();
    await p2(h.deps.db).pending_limits.insertOne({ _id: pid, org_id: orgId, team_id: student, donor_id: d._id, log_id: log._id, limit: "Do not call (donor request)", status: "pending", created_at: ago(1), decided_by: null, decided_at: null });
    expect((await coord.get("/api/pending-limits")).json.pending_limits).toHaveLength(1);
    expect((await coord.post(`/api/pending-limits/${pid}/decision`, { action: "approve" })).status).toBe(200);
    expect((await h.deps.db.collection("donors").findOne({ _id: d._id as never }))?.limits).toContain("Do not call (donor request)");
    const fu = randomUUID();
    await p2(h.deps.db).follow_ups.insertOne({ _id: fu, org_id: orgId, donor_id: d._id, team_id: student, owner_user_id: callerId, action: "Send receipt", due_date: ymd(ago(2)), status: "open", created_from_log_id: log._id, created_at: ago(5), closed_at: null, last_note: null });
    const listed = (await coord.get("/api/follow-ups?overdue=true")).json.follow_ups as Array<{ id: string; overdue: boolean; donor_ref: string }>;
    expect(listed.find((f) => f.id === fu)?.overdue).toBe(true);
    expect((await coord.post(`/api/follow-ups/${fu}/cancel`, {})).status).toBe(400);
    expect((await coord.post(`/api/follow-ups/${fu}/cancel`, { note: "Donor asked us to stop." })).status).toBe(200);
    expect((await caller.post(`/api/follow-ups/${fu}/cancel`, { note: "x" })).status).toBe(403);
  });
  it("calls list uses donor references, not names; detail has fields only", async () => {
    const list = (await coord.get("/api/calls?limit=5")).json;
    expect(list.calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toMatch(/Rosalind|Featherstone|Harriet|Penwarden/);
    expect(list.calls[0].donor_ref).toMatch(/^d-\d+$/);
    const detail = (await coord.get(`/api/calls/${list.calls[0].id}`)).json;
    expect(Object.keys(detail)).not.toContain("note");
    expect(detail.approved.outcome).toBeTruthy();
  });
});

describe("fact sheet versions", () => {
  let sheetId: string;
  let itemId: string;
  const draft = (extra: object = {}) => ({ item_id: itemId, text: "Mentors meet students every week after school.", source: "Program office report", verified_on: ymd(ago(10)), owner_user_id: "", ...extra });
  let coordId: string;
  beforeAll(async () => {
    coordId = (await coord.get("/api/me")).json.user.id;
    const imp = await coord.post("/api/imports/fact_sheet/commit", { file_name: "facts.json", content: JSON.stringify({ items: [{ text: "Original approved fact.", source: "Annual report", verified_on: ymd(ago(30)) }] }), campaign_name: "Spring Youth Appeal 2026" });
    expect(imp.status).toBe(201);
    const sheets = (await coord.get("/api/fact-sheets")).json.fact_sheets as Array<{ id: string; name: string; items: Array<{ id: string }> }>;
    const s = sheets.find((x) => x.name === "facts.json")!;
    sheetId = s.id;
    itemId = s.items[0]!.id;
  });

  it("with several coordinators, the author cannot approve their own draft; another coordinator can", async () => {
    // v1 was imported as a draft (author = importing coordinator).
    const v1 = (await coord.get(`/api/fact-sheets/${sheetId}/versions`)).json.versions[0];
    expect((await coord.post(`/api/fact-sheets/${sheetId}/versions/${v1.id}/approve`, {})).status).toBe(403);
    expect((await caller.post(`/api/fact-sheets/${sheetId}/versions/${v1.id}/approve`, {})).status).toBe(403);
    expect((await coord3.post(`/api/fact-sheets/${sheetId}/versions/${v1.id}/approve`, {})).status).toBe(200);
    const view = (await caller.get("/api/fact-sheets")).json.fact_sheets.find((s: { _id: string }) => s._id === sheetId);
    expect(view.items.map((i: { text: string }) => i.text)).toEqual(["Original approved fact."]);
  });

  it("saving a draft does not change what callers see; approving does", async () => {
    const r = await coord.post(`/api/fact-sheets/${sheetId}/versions`, draft({ owner_user_id: coordId }));
    expect(r.status).toBe(201);
    expect(r.json.version).toBe(2);
    const callerView = (items: unknown) => (items as Array<{ text: string }>).map((i) => i.text);
    const before = (await caller.get("/api/fact-sheets")).json.fact_sheets.find((s: { _id: string }) => s._id === sheetId);
    expect(callerView(before.items)).toEqual(["Original approved fact."]);
    const editor = (await coord.get("/api/fact-sheets")).json.fact_sheets.find((s: { id: string }) => s.id === sheetId);
    const item = editor.items[0];
    expect(item.approved.text).toBe("Original approved fact.");
    expect(item.draft.text).toBe("Mentors meet students every week after school.");
    expect(item.has_pending_draft).toBe(true);
    const v2 = (await coord.get(`/api/fact-sheets/${sheetId}/versions`)).json.versions.find((v: { version: number }) => v.version === 2);
    expect((await coord.post(`/api/fact-sheets/${sheetId}/versions/${v2.id}/approve`, {})).status).toBe(403); // second approver required
    expect((await coord3.post(`/api/fact-sheets/${sheetId}/versions/${v2.id}/approve`, { note: "Checked against the report." })).status).toBe(200);
    const after = (await caller.get("/api/fact-sheets")).json.fact_sheets.find((s: { _id: string }) => s._id === sheetId);
    expect(callerView(after.items)).toEqual(["Mentors meet students every week after school."]);
    const audit = await h.deps.db.collection("audit_log").find({ action: "fact.approve", target_id: itemId }).toArray();
    expect(audit.length).toBe(2);
  });

  it("refuses to save a draft missing text, source, verified_on, or owner, or over 240 characters", async () => {
    for (const bad of [{ text: "" }, { source: "" }, { verified_on: "" }, { owner_user_id: "" }, { text: "x".repeat(241) }]) {
      const r = await coord.post(`/api/fact-sheets/${sheetId}/versions`, draft({ owner_user_id: coordId, ...bad }));
      expect(r.status).toBe(400);
    }
    expect((await coord.post(`/api/fact-sheets/${sheetId}/versions`, { item_id: itemId, text: "t", source: "s", verified_on: ymd(ago(1)) })).status).toBe(400);
  });

  it("warns about donor-specific content and refuses to approve it", async () => {
    const warn = (await coord.post("/api/fact-sheets/check", { text: `Ask ${donors[0]!.first_name} about it, or call 814-555-0142 or x@y.org.` })).json.warnings as string[];
    expect(warn).toEqual(expect.arrayContaining(["Contains a name from the donor list.", "Contains a phone number.", "Contains an email address."]));
    const saved = await coord.post(`/api/fact-sheets/${sheetId}/versions`, { text: `Call ${donors[1]!.last_name} back.`, source: "x", verified_on: ymd(ago(1)), owner_user_id: coordId });
    expect(saved.status).toBe(201);
    expect(saved.json.warnings.length).toBeGreaterThan(0);
    const v = (await coord.get(`/api/fact-sheets/${sheetId}/versions`)).json.versions.find((x: { item_id: string; status: string }) => x.item_id === saved.json.item_id && x.status === "draft");
    const r = await coord3.post(`/api/fact-sheets/${sheetId}/versions/${v.id}/approve`, {});
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("donor_specific_content");
  });

  it("stale approved items disappear from callers and re-verify creates a version", async () => {
    const stale = await coord.post(`/api/fact-sheets/${sheetId}/versions`, { text: "A stale approved fact.", source: "Old report", verified_on: ymd(ago(500)), owner_user_id: coordId });
    const v = (await coord.get(`/api/fact-sheets/${sheetId}/versions`)).json.versions.find((x: { item_id: string; status: string }) => x.item_id === stale.json.item_id && x.status === "draft");
    expect((await coord3.post(`/api/fact-sheets/${sheetId}/versions/${v.id}/approve`, {})).status).toBe(200);
    const editor = () => coord.get("/api/fact-sheets").then((r) => r.json.fact_sheets.find((s: { id: string }) => s.id === sheetId).items.find((i: { id: string }) => i.id === stale.json.item_id));
    expect((await editor()).status).toBe("stale");
    const callerItems = (await caller.get("/api/fact-sheets")).json.fact_sheets.find((s: { _id: string }) => s._id === sheetId).items as Array<{ text: string }>;
    expect(callerItems.map((i) => i.text)).not.toContain("A stale approved fact.");
    const rv = await coord.post(`/api/fact-sheets/${sheetId}/items/${stale.json.item_id}/reverify`, { source: "2026 report", verified_on: ymd(ago(1)) });
    expect(rv.status).toBe(201);
    const v3 = (await coord.get(`/api/fact-sheets/${sheetId}/versions`)).json.versions.find((x: { item_id: string; status: string }) => x.item_id === stale.json.item_id && x.status === "draft");
    expect((await coord3.post(`/api/fact-sheets/${sheetId}/versions/${v3.id}/approve`, {})).status).toBe(200);
    expect((await editor()).status).toBe("approved");
    expect((await caller.get("/api/fact-sheets")).json.fact_sheets.find((s: { _id: string }) => s._id === sheetId).items.map((i: { text: string }) => i.text)).toContain("A stale approved fact.");
  });
});

describe("single-coordinator org: self-approval is allowed and recorded", () => {
  it("records a self-approval note in the audit log", async () => {
    const solo = await signUpCoordinator(h, "k3-solo@example.org", "Solo Org");
    const soloId = (await solo.client.get("/api/me")).json.user.id;
    await solo.client.post("/api/imports/fact_sheet/commit", { file_name: "f.json", content: JSON.stringify({ items: [{ text: "Solo fact.", source: "Report", verified_on: ymd(ago(5)) }] }) });
    const sheet = (await solo.client.get("/api/fact-sheets")).json.fact_sheets[0];
    const v = (await solo.client.get(`/api/fact-sheets/${sheet.id}/versions`)).json.versions[0];
    const r = await solo.client.post(`/api/fact-sheets/${sheet.id}/versions/${v.id}/approve`, {});
    expect(r.status).toBe(200);
    expect(r.json.self_approved).toBe(true);
    const audit = await h.deps.db.collection("audit_log").findOne({ action: "fact.approve.self", who: soloId });
    expect(audit?.note).toMatch(/self-approval/);
  });
});

describe("rubrics, knowledge, handoffs, patterns, audit", () => {
  it("rubric edits create versions", async () => {
    await coord.post("/api/imports/rubric/commit", { file_name: "rubric.json", content: seedFile("rubric.json"), team_id: null });
    const rid = (await coord.get("/api/rubrics")).json.rubrics[0]._id;
    const items = [{ id: "thanked", text: "Thanked the donor", supporting_tags: [] }, { id: "next", text: "Closed with a next step", supporting_tags: ["FOLLOW_UP_REQUESTED"] }];
    expect((await coord.req("PUT", `/api/rubrics/${rid}`, { items, note: "Trimmed" })).json.version).toBe(2);
    const v = (await coord.get(`/api/rubrics/${rid}/versions`)).json.versions as Array<{ version: number; logs_evaluated: number }>;
    expect(v.map((x) => x.version)).toEqual([2, 1]);
    expect((await caller.req("PUT", `/api/rubrics/${rid}`, { items })).status).toBe(403);
  });

  it("knowledge entries: draft, then publish with an audit row; donor-specific text cannot publish", async () => {
    const e = (await coord.post("/api/knowledge", { type: "guidance", title: "Closing a call", body: "Thank the donor and name one next step." })).json.entry;
    expect(e.status).toBe("draft");
    expect((await coord.post(`/api/knowledge/${e._id}/publish`, {})).status).toBe(200);
    expect((await h.deps.db.collection("audit_log").findOne({ action: "knowledge.publish", target_id: e._id }))?.who).toBeTruthy();
    const bad = (await coord.post("/api/knowledge", { type: "process", title: "Oops", body: `Call ${donors[2]!.first_name} on 814-555-0142.` })).json.entry;
    expect((await coord.post(`/api/knowledge/${bad._id}/publish`, {})).status).toBe(422);
  });

  it("handoff packet: built from open follow-ups and published entries; the incoming coordinator acknowledges each item", async () => {
    const e = (await coord.post("/api/knowledge", { type: "handoff", title: "List notes", body: "Work the oldest follow-ups first." })).json.entry;
    await coord.post(`/api/knowledge/${e._id}/publish`, {});
    const fu = randomUUID();
    await p2(h.deps.db).follow_ups.insertOne({ _id: fu, org_id: orgId, donor_id: donors[4]!._id, team_id: student, owner_user_id: callerId, action: "Call back Tuesday", due_date: ymd(ago(-3)), status: "open", created_from_log_id: "x", created_at: ago(2), closed_at: null, last_note: null });
    const coord2Id = (await coord2.get("/api/me")).json.user.id;
    const made = await coord.post("/api/handoffs", { team_id: student, to_user_id: coord2Id, note: "Going on leave", follow_up_ids: [fu], entry_ids: [e._id] });
    expect(made.status).toBe(201);
    expect(made.json.packet.items).toHaveLength(2);
    const incoming = (await coord2.get("/api/handoffs")).json.packets[0];
    expect(incoming.direction).toBe("incoming");
    expect((await coord.post(`/api/handoffs/${incoming._id}/items/${incoming.items[0].id}/acknowledge`, {})).status).toBe(404); // not the recipient
    expect((await coord2.post(`/api/handoffs/${incoming._id}/items/${incoming.items[0].id}/acknowledge`, {})).json.packet_complete).toBe(false);
    expect((await coord2.post(`/api/handoffs/${incoming._id}/items/${incoming.items[1].id}/acknowledge`, {})).json.packet_complete).toBe(true);
    expect((await coord.post("/api/handoffs", { team_id: student, to_user_id: callerId, follow_up_ids: [], entry_ids: [] })).status).toBe(422);
  });

  it("patterns can be approved or retired by coordinators, and never expose donor fields", async () => {
    await h.deps.db.collection("patterns").insertOne({ _id: "p1" as never, org_id: orgId, title: "Evening calls reach more", description: "d", segment: "Spring appeal", denominator: 40, date_from: "2026-01-01", date_to: "2026-06-30", status: "proposed", decided_by: null, decided_at: null, created_at: new Date(), donor_id: "leak" });
    const list = (await coord.get("/api/patterns")).json.patterns;
    expect(JSON.stringify(list)).not.toContain("leak");
    expect((await coord.post("/api/patterns/p1/decision", { action: "approve" })).json.status).toBe("approved");
    expect((await caller.post("/api/patterns/p1/decision", { action: "retire" })).status).toBe(403);
  });

  it("audit log: filterable, read-only, CSV export", async () => {
    const all = (await coord.get("/api/audit?limit=200")).json;
    expect(all.total).toBeGreaterThan(10);
    const only = (await coord.get("/api/audit?action=flag.resolve")).json;
    expect(only.rows.length).toBe(1);
    expect(only.rows[0].action).toBe("flag.resolve");
    const csv = await coord.get("/api/audit.csv?target_type=flag");
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.text.split(/\r?\n/)[0]).toBe("ts,who,action,target_type,target_id,note");
    expect((await coord.req("DELETE", "/api/audit", {})).status).toBe(404);
    expect((await coord.get("/api/audit?from=nope")).status).toBe(400);
    expect((await caller.get("/api/audit")).status).toBe(403);
  });
});

describe("overview", () => {
  it("returns operational counts that match seeded data, without the word score", async () => {
    const o = (await coord.get("/api/dashboard/overview")).json;
    expect(o.suggested_note).toBe("Suggested by model, needs review.");
    expect(o.calls_this_week).toEqual({ completed: expect.any(Number), approved: expect.any(Number), pending_approval: expect.any(Number) });
    expect(o.queue.open).toBe(await p2(h.deps.db).flags.countDocuments({ org_id: orgId, status: "proposed" }));
    expect(o.follow_ups.open).toBe(await p2(h.deps.db).follow_ups.countDocuments({ org_id: orgId, status: "open" }));
    expect(JSON.stringify(o)).not.toMatch(/score/i);
    const scoped = (await coord.get(`/api/dashboard/overview?team_id=${alumni}`)).json;
    expect(scoped.scope.team_id).toBe(alumni);
    expect((await coord2.get(`/api/dashboard/overview?team_id=${alumni}`)).status).toBe(404);
  });
  it("teams panel and tree", async () => {
    const t = (await coord.get("/api/dashboard/teams")).json.teams as Array<{ name: string; members: number }>;
    expect(t.map((x) => x.name)).toEqual(expect.arrayContaining(["Student Callers", "Alumni Callers"]));
  });
});
