import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../src/db/audit.ts";
import { INVITE_TTL_MS } from "../src/services/invites.ts";
import { Client, harness, inviteAndAccept, seedFile, signUpCoordinator, type Harness } from "./helpers.ts";

let h: Harness;
let coord: Client;
let rootTeamId: string;
let orgId: string;
let teamA: string;
let teamB: string;
let subA: string;
let volunteer: Client;

beforeAll(async () => {
  h = await harness();
  ({ client: coord, rootTeamId, orgId } = await signUpCoordinator(h, "coord@example.org", "Org One"));
  teamA = (await coord.post("/api/teams", { name: "Student Callers", focus: "student calling" })).json.team._id;
  teamB = (await coord.post("/api/teams", { name: "Alumni Callers", focus: "alumni" })).json.team._id;
  subA = (await coord.post("/api/teams", { name: "Intl", focus: "international donors", parent_team_id: teamA })).json.team._id;
  ({ client: volunteer } = await inviteAndAccept(h, coord, teamA, "vol@example.org"));
  const imp = await coord.post("/api/imports/donors/commit", { file_name: "donors.csv", content: seedFile("donors.csv") });
  expect(imp.json.seed_run.accepted_count).toBe(10);
}, 60_000);
afterAll(async () => h?.close());

describe("sign-up and onboarding", () => {
  it("creates org, root team, and coordinator membership", async () => {
    const me = await coord.get("/api/me");
    expect(me.json.org.name).toBe("Org One");
    expect(me.json.teams[0]._id).toBe(rootTeamId);
    expect(me.json.teams[0].children.map((t: { name: string }) => t.name)).toEqual(["Student Callers", "Alumni Callers"]);
  });

  it("rejects public volunteer self-registration", async () => {
    const r = await new Client(h).post("/api/auth/sign-up/email", { email: "sneaky@example.org", password: "whatever-123", name: "S", user_type: "volunteer" });
    expect(r.status).toBe(403);
  });

  it("limits team depth to root -> team -> subteam", async () => {
    const r = await coord.post("/api/teams", { name: "Too deep", focus: "", parent_team_id: subA });
    expect(r.status).toBe(422);
  });
});

describe("session required", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/me"],
    ["GET", "/api/teams"],
    ["POST", "/api/teams"],
    ["GET", "/api/donors"],
    ["GET", "/api/invites"],
    ["POST", "/api/imports/donors/preview"],
    ["GET", "/api/fact-sheets"],
    ["GET", "/api/seed-runs"],
  ];
  it.each(routes)("%s %s -> 401 without a session", async (method, path) => {
    expect((await new Client(h).req(method, path, method === "GET" ? undefined : {})).status).toBe(401);
  });
  it("invite lookup and accept do not require a session", async () => {
    expect((await new Client(h).post("/api/invites/lookup", { token: "x".repeat(40) })).status).toBe(404);
  });
  it("sign-in works and returns a session", async () => {
    const c = new Client(h);
    expect((await c.post("/api/auth/sign-in/email", { email: "vol@example.org", password: "volunteer-pass-123" })).status).toBe(200);
    expect((await c.get("/api/me")).json.user.user_type).toBe("volunteer");
  });
});

describe("volunteer restrictions", () => {
  it("lands with the invited team visible", async () => {
    const me = await volunteer.get("/api/me");
    expect(me.json.user.user_type).toBe("volunteer");
    expect(me.json.teams.map((t: { _id: string }) => t._id)).toEqual([teamA]);
  });
  it("cannot create teams, invites, or seed data", async () => {
    expect((await volunteer.post("/api/teams", { name: "X", focus: "" })).status).toBe(403);
    expect((await volunteer.post(`/api/teams/${teamA}/invites`, { email: "a@example.org", role: "caller" })).status).toBe(403);
    expect((await volunteer.post("/api/imports/donors/commit", { file_name: "d.csv", content: seedFile("donors.csv") })).status).toBe(403);
    expect((await volunteer.get("/api/invites")).status).toBe(403);
    expect((await volunteer.get(`/api/teams/${teamA}/members`)).status).toBe(403);
  });
  it("cannot see subteams (inheritance is for coordinators only) or other teams", async () => {
    expect((await volunteer.get(`/api/teams/${subA}/members`)).status).toBe(404);
    expect((await volunteer.get(`/api/teams/${teamB}/members`)).status).toBe(404);
  });
  it("caller cannot read a donor outside their team", async () => {
    const all = (await coord.get("/api/donors")).json.donors as Array<{ _id: string; team_ids: string[] }>;
    const inB = all.find((d) => d.team_ids.includes(teamB))!;
    const inA = all.find((d) => d.team_ids.includes(teamA))!;
    expect((await volunteer.get(`/api/donors/${inB._id}`)).status).toBe(404);
    expect((await volunteer.get(`/api/donors/${inA._id}`)).status).toBe(200);
    const listed = (await volunteer.get("/api/donors")).json.donors as Array<{ team_ids: string[] }>;
    expect(listed.length).toBe(5);
    expect(listed.every((d) => d.team_ids.includes(teamA))).toBe(true);
    expect((await volunteer.get(`/api/donors?team_id=${teamB}`)).status).toBe(404);
  });
  it("fact sheet drafts are hidden from callers and cannot be approved by a volunteer", async () => {
    const imp = await coord.post("/api/imports/fact_sheet/commit", { file_name: "fact-sheet.json", content: seedFile("fact-sheet.json"), campaign_name: "Spring Youth Appeal 2026" });
    expect(imp.json.seed_run.accepted_count).toBe(3);
    const sheets = (await coord.get("/api/fact-sheets")).json.fact_sheets;
    const sheet = sheets[0];
    expect(sheet.items.every((i: { status: string }) => i.status === "draft")).toBe(true);
    expect((await volunteer.get("/api/fact-sheets")).json.fact_sheets[0].items).toEqual([]);
    expect((await volunteer.post(`/api/fact-sheets/${sheet._id}/items/${sheet.items[0].id}/approve`)).status).toBe(403);
    expect((await coord.post(`/api/fact-sheets/${sheet._id}/items/${sheet.items[0].id}/approve`)).status).toBe(200);
    expect((await volunteer.get("/api/fact-sheets")).json.fact_sheets[0].items).toHaveLength(1);
  });
});

describe("cross-org access", () => {
  it("returns 404 for another org's team, donor, membership, and invite", async () => {
    const other = await signUpCoordinator(h, "other@example.org", "Org Two");
    const donorId = (await coord.get("/api/donors")).json.donors[0]._id;
    const members = (await coord.get(`/api/teams/${teamA}/members`)).json.members;
    const invId = (await coord.post(`/api/teams/${teamA}/invites`, { email: "x1@example.org", role: "caller" })).json.invite._id;
    expect((await other.client.get(`/api/donors/${donorId}`)).status).toBe(404);
    expect((await other.client.get(`/api/teams/${teamA}/members`)).status).toBe(404);
    expect((await other.client.post("/api/teams", { name: "Sneak", focus: "", parent_team_id: teamA })).status).toBe(404);
    expect((await other.client.post(`/api/memberships/${members[0].membership_id}/remove`)).status).toBe(404);
    expect((await other.client.post(`/api/invites/${invId}/revoke`)).status).toBe(404);
    expect((await other.client.get("/api/donors")).json.donors).toEqual([]);
  });
});

describe("invites", () => {
  it("stores only a hash of the token and prints the link (console mail)", async () => {
    await coord.post(`/api/teams/${teamB}/invites`, { email: "hash@example.org", role: "caller" });
    const token = h.mails.at(-1)!.link.split("/invite/")[1]!;
    const docs = await h.deps.db.collection("invites").find({ email: "hash@example.org" }).toArray();
    expect(JSON.stringify(docs)).not.toContain(token);
    expect(docs[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reused token: second accept returns 410 already_used and changes nothing", async () => {
    const { token } = await inviteAndAccept(h, coord, teamB, "twice@example.org");
    const again = await new Client(h).post("/api/invites/accept", { token, password: "volunteer-pass-123", display_name: "V", timezone: "UTC" });
    expect(again.status).toBe(410);
    expect(again.json.error).toBe("already_used");
  });

  it("revoked token -> 410", async () => {
    const inv = await coord.post(`/api/teams/${teamB}/invites`, { email: "revoked@example.org", role: "caller" });
    const token = h.mails.at(-1)!.link.split("/invite/")[1]!;
    expect((await coord.post(`/api/invites/${inv.json.invite._id}/revoke`)).status).toBe(200);
    expect((await new Client(h).post("/api/invites/lookup", { token })).status).toBe(410);
    expect((await new Client(h).post("/api/invites/accept", { token, password: "volunteer-pass-123", display_name: "V", timezone: "UTC" })).status).toBe(410);
  });

  it("expired token -> 410", async () => {
    await coord.post(`/api/teams/${teamB}/invites`, { email: "late@example.org", role: "caller" });
    const token = h.mails.at(-1)!.link.split("/invite/")[1]!;
    const real = h.clock.now;
    h.clock.now = new Date(real.getTime() + INVITE_TTL_MS + 1000);
    try {
      const r = await new Client(h).post("/api/invites/accept", { token, password: "volunteer-pass-123", display_name: "V", timezone: "UTC" });
      expect(r.status).toBe(410);
      expect(r.json.error).toBe("expired");
    } finally {
      h.clock.now = real;
    }
  });

  it("resend rotates the token: the old link stops working", async () => {
    const inv = await coord.post(`/api/teams/${teamB}/invites`, { email: "rotate@example.org", role: "caller" });
    const oldToken = h.mails.at(-1)!.link.split("/invite/")[1]!;
    await coord.post(`/api/invites/${inv.json.invite._id}/resend`);
    const newToken = h.mails.at(-1)!.link.split("/invite/")[1]!;
    expect(newToken).not.toBe(oldToken);
    expect((await new Client(h).post("/api/invites/lookup", { token: oldToken })).status).toBe(404);
    expect((await new Client(h).post("/api/invites/lookup", { token: newToken })).status).toBe(200);
  });

  it("lists invites with states", async () => {
    const list = (await coord.get("/api/invites")).json.invites as Array<{ email: string; state: string; token_hash?: string }>;
    expect(list.find((i) => i.email === "revoked@example.org")?.state).toBe("revoked");
    expect(list.find((i) => i.email === "twice@example.org")?.state).toBe("accepted");
    expect(list.some((i) => "token_hash" in i)).toBe(false);
  });
});

describe("invite link in response (production, no email service)", () => {
  it("returns the link to the coordinator only when INVITE_LINK_IN_RESPONSE=1", async () => {
    const off = await coord.post(`/api/teams/${teamB}/invites`, { email: "nolink@example.org", role: "caller" });
    expect(off.json.link).toBeUndefined();
    h.deps.env.INVITE_LINK_IN_RESPONSE = "1";
    try {
      const on = await coord.post(`/api/teams/${teamB}/invites`, { email: "withlink@example.org", role: "caller" });
      expect(on.json.link).toMatch(/\/invite\/[A-Za-z0-9_-]{20,}$/);
      const resent = await coord.post(`/api/invites/${on.json.invite._id}/resend`);
      expect(resent.json.link).toMatch(/\/invite\//);
      expect(resent.json.link).not.toBe(on.json.link);
    } finally {
      delete h.deps.env.INVITE_LINK_IN_RESPONSE;
    }
  });
});

describe("members", () => {
  it("removing a member sets status removed and writes an audit row", async () => {
    const { client: v } = await inviteAndAccept(h, coord, teamB, "remove-me@example.org");
    const members = (await coord.get(`/api/teams/${teamB}/members`)).json.members as Array<{ membership_id: string; email: string; status: string }>;
    const m = members.find((x) => x.email === "remove-me@example.org")!;
    expect((await coord.post(`/api/memberships/${m.membership_id}/remove`)).status).toBe(200);
    const after = (await coord.get(`/api/teams/${teamB}/members`)).json.members as Array<{ email: string; status: string }>;
    expect(after.find((x) => x.email === "remove-me@example.org")?.status).toBe("removed");
    expect((await listAudit(h.deps.db, orgId, { target_id: m.membership_id })).map((a) => a.action)).toEqual(["membership.remove"]);
    expect((await v.get("/api/me")).json.teams).toEqual([]);
  });
});
