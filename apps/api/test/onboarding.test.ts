import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orgModelContext, renderOrgContext } from "../src/services/orgContext.ts";
import { harness, signUpCoordinator, inviteAndAccept, type Harness } from "./helpers.ts";

let h: Harness;
const today = () => new Date().toISOString().slice(0, 10);
const facts = (n: number) => ({
  items: Array.from({ length: n }, (_, i) => ({ text: `Program fact ${i + 1} from the annual report.`, source: "Annual report 2026", verified_on: today() })),
});

beforeAll(async () => {
  h = await harness();
}, 60_000);
afterAll(async () => h?.close());

describe("organization profile", () => {
  it("lets a coordinator save the profile and shows it on /me", async () => {
    const s = await signUpCoordinator(h, "profile@example.org", "Profile Org");
    const saved = await s.client.put("/api/org/profile", { nonprofit_status: "registered_nonprofit", annual_revenue_band: "100k_to_1m", staff_size_band: "1_to_10", mission: "Youth mentoring after school.", country: "Canada" });
    expect(saved.status).toBe(200);
    const me = (await s.client.get("/api/me")).json;
    expect(me.org).toMatchObject({ nonprofit_status: "registered_nonprofit", annual_revenue_band: "100k_to_1m", staff_size_band: "1_to_10", mission: "Youth mentoring after school.", country: "Canada" });
  });

  it("clears a field when null is sent and leaves unsent fields alone", async () => {
    const s = await signUpCoordinator(h, "clear@example.org", "Clear Org");
    await s.client.put("/api/org/profile", { nonprofit_status: "community_group", country: "Kenya" });
    await s.client.put("/api/org/profile", { country: null });
    const me = (await s.client.get("/api/me")).json;
    expect(me.org.country).toBeNull();
    expect(me.org.nonprofit_status).toBe("community_group");
  });

  it("rejects values outside the enums and unknown fields", async () => {
    const s = await signUpCoordinator(h, "bad-profile@example.org", "Bad Profile Org");
    expect((await s.client.put("/api/org/profile", { annual_revenue_band: "a lot" })).status).toBe(400);
    expect((await s.client.put("/api/org/profile", { tax_id: "12-3456789" })).status).toBe(400);
  });

  it("does not let a volunteer change the organization", async () => {
    const s = await signUpCoordinator(h, "vol-profile@example.org", "Volunteer Profile Org");
    const v = await inviteAndAccept(h, s.client, s.rootTeamId, "caller-profile@example.org");
    expect((await v.client.put("/api/org/profile", { country: "Spain" })).status).toBe(403);
  });
});

describe("fact sheet upload during onboarding", () => {
  it("imports and approves every item, so Bedrock context and callers see them", async () => {
    const s = await signUpCoordinator(h, "facts@example.org", "Facts Org");
    const up = await s.client.post("/api/onboarding/fact-sheet", { file_name: "facts.json", content: JSON.stringify(facts(3)), update_existing: false });
    expect(up.status).toBe(201);
    expect(up.json).toMatchObject({ accepted: 3, approved: 3 });
    const sheets = (await s.client.get("/api/fact-sheets")).json.fact_sheets;
    expect(sheets.find((x: { name: string }) => x.name === "facts.json")?.items).toHaveLength(3);
  });

  it("feeds the approved facts into the org model context", async () => {
    const s = await signUpCoordinator(h, "context@example.org", "Context Org");
    await s.client.post("/api/onboarding/fact-sheet", { file_name: "ctx.json", content: JSON.stringify(facts(2)), update_existing: false });
    await s.client.put("/api/org/profile", { mission: "Youth mentoring after school." });
    const ctx = await orgModelContext(h.deps, s.orgId);
    expect(ctx.mission).toBe("Youth mentoring after school.");
    expect(ctx.facts.map((f) => f.source)).toEqual(["Annual report 2026", "Annual report 2026"]);
    expect(renderOrgContext(ctx)).toContain("(Source: Annual report 2026; verified");
  });

  it("returns 422 when no row is valid, with rejects counted and no values echoed", async () => {
    const s = await signUpCoordinator(h, "badfacts@example.org", "Bad Facts Org");
    const r = await s.client.post("/api/onboarding/fact-sheet", { file_name: "bad.json", content: JSON.stringify({ items: [{ text: "", source: "", verified_on: "soon" }] }), update_existing: false });
    expect(r.status).toBe(422);
    expect(r.text).not.toContain("soon");
  });

  it("refuses a donor phone number inside a fact", async () => {
    const s = await signUpCoordinator(h, "phone-fact@example.org", "Phone Fact Org");
    const r = await s.client.post("/api/onboarding/fact-sheet", { file_name: "p.json", content: JSON.stringify({ items: [{ text: "Call 555-867-5309 for details.", source: "Desk", verified_on: today() }] }), update_existing: false });
    expect(r.status).toBe(422);
    expect(r.json.warnings).toEqual(["Contains a phone number."]);
    expect(r.text).not.toContain("555-867-5309");
    expect((await s.client.get("/api/fact-sheets")).json.fact_sheets).toHaveLength(0);
  });
});

describe("rubric weights during onboarding", () => {
  it("creates the org rubric when none exists, with the weights set", async () => {
    const s = await signUpCoordinator(h, "weights@example.org", "Weights Org");
    const items = [
      { id: "thanked_by_name", text: "Thanked the donor by name", supporting_tags: [], conditional_on_tag: null, weight: 3 },
      { id: "no_ask", text: "Made no ask in this call", supporting_tags: [], conditional_on_tag: null, weight: 0 },
    ];
    const created = await s.client.put("/api/onboarding/rubric", { items });
    expect(created.status).toBe(200);
    const rubrics = (await s.client.get("/api/rubrics")).json.rubrics;
    expect(rubrics).toHaveLength(1);
    expect(rubrics[0].items.map((i: { weight: number }) => i.weight)).toEqual([3, 0]);
  });

  it("saves a change to an existing org rubric as a new version", async () => {
    const s = await signUpCoordinator(h, "reweight@example.org", "Reweight Org");
    const base = [{ id: "a", text: "First item", supporting_tags: [], conditional_on_tag: null }, { id: "b", text: "Second item", supporting_tags: [], conditional_on_tag: null }];
    await s.client.put("/api/onboarding/rubric", { items: base });
    const r = await s.client.put("/api/onboarding/rubric", { items: base.map((i, n) => ({ ...i, weight: n + 2 })), note: "Weighted" });
    expect(r.json.version).toBe(2);
    const rubric = (await s.client.get("/api/rubrics")).json.rubrics[0];
    expect(rubric.version).toBe(2);
    expect(rubric.items.map((i: { weight: number }) => i.weight)).toEqual([2, 3]);
  });

  it("rejects weights outside 0 to 5", async () => {
    const s = await signUpCoordinator(h, "badweight@example.org", "Bad Weight Org");
    const r = await s.client.put("/api/onboarding/rubric", { items: [{ id: "a", text: "x", supporting_tags: [], conditional_on_tag: null, weight: 9 }] });
    expect(r.status).toBe(400);
  });
});
