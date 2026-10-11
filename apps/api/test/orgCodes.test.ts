import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, harness, signUpCoordinator, type Harness } from "./helpers.ts";
import { generateJoinCode, normalizeJoinCode } from "../src/services/orgCodes.ts";

let h: Harness;
beforeAll(async () => {
  h = await harness();
}, 60_000);
afterAll(async () => h?.close());

/** A volunteer with no organization, signed in. Public sign-up is coordinator-only, so this uses the server path. */
async function volunteerWithoutOrg(email: string) {
  await h.deps.auth.api.signUpEmail({ body: { email, password: "volunteer-pass-123", name: "Vol", user_type: "volunteer", display_name: "Vol", timezone: "America/Chicago" } });
  const c = new Client(h);
  const r = await c.post("/api/auth/sign-in/email", { email, password: "volunteer-pass-123" });
  if (r.status !== 200) throw new Error(`sign-in failed ${r.status}`);
  return c;
}

describe("join codes", () => {
  it("formats codes as XXXX-XXXX from an alphabet without look-alike characters", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateJoinCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
    expect(normalizeJoinCode(" abcd-2345 ")).toBe("ABCD2345");
  });

  it("generates a code once, stores only its hash, and reports it as active", async () => {
    const s = await signUpCoordinator(h, "codes@example.org", "Codes Org");
    const before = (await s.client.get("/api/org/join-code")).json;
    expect(before.active).toBe(false);
    const rotated = await s.client.post("/api/org/join-code/rotate", {});
    expect(rotated.status).toBe(200);
    expect(rotated.json.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect((await s.client.get("/api/org/join-code")).json.active).toBe(true);
    const org = await h.deps.db.collection("organizations").findOne({ _id: s.orgId } as never);
    expect(JSON.stringify(org)).not.toContain(rotated.json.code.replace("-", ""));
    expect(org?.invite_code_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("lets a volunteer join the main team as a caller, with or without the dash and in any case", async () => {
    const s = await signUpCoordinator(h, "join-main@example.org", "Join Main Org");
    const { code } = (await s.client.post("/api/org/join-code/rotate", {})).json;
    const v = await volunteerWithoutOrg("joiner@example.org");
    const joined = await v.post("/api/org/join", { code: code.replace("-", "").toLowerCase() });
    expect(joined.status).toBe(201);
    expect(joined.json.team_id).toBe(s.rootTeamId);
    const me = (await v.get("/api/me")).json;
    expect(me.org.id).toBe(s.orgId);
    expect(me.teams[0]).toMatchObject({ _id: s.rootTeamId, role: "caller" });
  });

  it("refuses a second join, a wrong code, and a coordinator joining", async () => {
    const s = await signUpCoordinator(h, "refuse@example.org", "Refuse Org");
    const { code } = (await s.client.post("/api/org/join-code/rotate", {})).json;
    const v = await volunteerWithoutOrg("twice@example.org");
    expect((await v.post("/api/org/join", { code: "ZZZZ-ZZZZ" })).status).toBe(404);
    expect((await v.post("/api/org/join", { code })).status).toBe(201);
    expect((await v.post("/api/org/join", { code })).status).toBe(409);
    expect((await s.client.post("/api/org/join", { code })).status).toBe(403);
  });

  it("stops the old code working as soon as it is rotated", async () => {
    const s = await signUpCoordinator(h, "rotate@example.org", "Rotate Org");
    const old = (await s.client.post("/api/org/join-code/rotate", {})).json.code;
    await s.client.post("/api/org/join-code/rotate", {});
    const v = await volunteerWithoutOrg("late@example.org");
    expect((await v.post("/api/org/join", { code: old })).status).toBe(404);
  });

  it("keeps the coordinator-only status and rotate routes away from volunteers", async () => {
    const s = await signUpCoordinator(h, "owner@example.org", "Owner Org");
    await s.client.post("/api/org/join-code/rotate", {});
    const v = await volunteerWithoutOrg("nosy@example.org");
    expect((await v.get("/api/org/join-code")).status).toBe(409);
    expect((await v.post("/api/org/join-code/rotate", {})).status).toBe(409);
  });
});
