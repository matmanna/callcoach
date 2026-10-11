import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, harness, signUpCoordinator, type Harness } from "./helpers.ts";

let h: Harness;
beforeAll(async () => {
  h = await harness();
}, 60_000);
afterAll(async () => h?.close());

/** A volunteer with no organization, signed in. Public sign-up is coordinator-only, so this uses the server path. */
async function volunteer(email: string) {
  await h.deps.auth.api.signUpEmail({ body: { email, password: "volunteer-pass-123", name: "Vol", user_type: "volunteer", display_name: "Vol", timezone: "America/Chicago" } });
  const c = new Client(h);
  const r = await c.post("/api/auth/sign-in/email", { email, password: "volunteer-pass-123" });
  if (r.status !== 200) throw new Error(`sign-in failed ${r.status}`);
  return c;
}

async function seedDonors(orgId: string, n: number) {
  await h.deps.db.collection("donors").insertMany(Array.from({ length: n }, (_, i) => ({
    _id: randomUUID(), org_id: orgId, external_id: `t-${randomUUID().slice(0, 8)}-${i}`, team_ids: [], first_name: "A", last_name: `B${i}`,
    spouse_name: null, employer: null, town: null, campaign: "Spring", gift_band: "$50-$99", past_gift_count: 1, last_gift_band: "$50-$99",
    limits: [], timezone_hint: null, region: "US-PA", created_at: new Date(), updated_at: new Date(),
  })) as never);
}

describe("join codes seed the team's call list", () => {
  it("gives a volunteer who joins by code donors to call", async () => {
    const s = await signUpCoordinator(h, "seedjoin@example.org", "Seed Join Org");
    await seedDonors(s.orgId, 6);
    const { code } = (await s.client.post("/api/org/join-code/rotate", {})).json;
    const v = await volunteer("joined-with-donors@example.org");
    expect((await v.post("/api/org/join", { code })).status).toBe(201);
    const donors = (await v.get("/api/donors")).json.donors as unknown[];
    expect(donors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("volunteer service scope", () => {
  it("saves local with a region, and refuses local without one or a malformed region", async () => {
    const v = await volunteer("scope-save@example.org");
    expect((await v.patch("/api/me", { service_scope: "local" })).status).toBe(400);
    expect((await v.patch("/api/me", { service_scope: "local", home_region: "Pennsylvania" })).status).toBe(400);
    expect((await v.patch("/api/me", { service_scope: "local", home_region: "US-PA" })).status).toBe(200);
    const me = (await v.get("/api/me")).json;
    expect(me.user).toMatchObject({ service_scope: "local", home_region: "US-PA" });
  });

  it("accepts national and global without a region", async () => {
    const v = await volunteer("scope-national@example.org");
    expect((await v.patch("/api/me", { service_scope: "national" })).status).toBe(200);
    expect((await v.get("/api/me")).json.user).toMatchObject({ service_scope: "national", home_region: null });
  });
});

describe("insights map default follows volunteer service scope", () => {
  it("defaults to regions when most volunteers are local, to countries otherwise, and an explicit level wins", async () => {
    const s = await signUpCoordinator(h, "mapdefault@example.org", "Map Default Org");
    const { code } = (await s.client.post("/api/org/join-code/rotate", {})).json;
    const a = await volunteer("map-local-1@example.org");
    const b = await volunteer("map-local-2@example.org");
    const n = await volunteer("map-national@example.org");
    for (const c of [a, b, n]) expect((await c.post("/api/org/join", { code })).status).toBe(201);
    await a.patch("/api/me", { service_scope: "local", home_region: "US-PA" });
    await b.patch("/api/me", { service_scope: "local", home_region: "US-OH" });
    await n.patch("/api/me", { service_scope: "national" });

    const withDefault = (await s.client.get("/api/insights/map")).json;
    expect(withDefault.suggested_level).toBe("region");
    expect(withDefault.level).toBe("region");
    // Two local volunteers is under the five-person cell size, so the mix is suppressed rather than shown.
    expect(withDefault.scope_mix.local).toEqual({ suppressed: true });

    const explicit = (await s.client.get("/api/insights/map?level=country")).json;
    expect(explicit.level).toBe("country");
    expect(explicit.suggested_level).toBe("region");
  });

  it("defaults to countries when volunteers are mostly national or global", async () => {
    const s = await signUpCoordinator(h, "mapnational@example.org", "Map National Org");
    const { code } = (await s.client.post("/api/org/join-code/rotate", {})).json;
    const a = await volunteer("map-nat-1@example.org");
    const b = await volunteer("map-glob-1@example.org");
    for (const c of [a, b]) expect((await c.post("/api/org/join", { code })).status).toBe(201);
    await a.patch("/api/me", { service_scope: "national" });
    await b.patch("/api/me", { service_scope: "global" });
    expect((await s.client.get("/api/insights/map")).json.level).toBe("country");
  });
});
