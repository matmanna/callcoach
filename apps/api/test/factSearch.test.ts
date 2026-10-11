import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_QUERY_CHARS, atlasSearchPipeline, searchFacts } from "../src/services/factSearch.ts";
import { harness, signUpCoordinator, type Harness } from "./helpers.ts";

let h: Harness;
beforeAll(async () => {
  h = await harness();
}, 60_000);
afterAll(async () => h?.close());

async function addVersion(orgId: string, text: string, status: "approved" | "draft", source = "Annual report 2026") {
  await h.deps.db.collection("fact_item_versions").insertOne({
    _id: randomUUID(), org_id: orgId, sheet_id: randomUUID(), item_id: randomUUID(), version: 1, text, source,
    verified_on: "2026-09-15", owner_user_id: "owner", status, created_by: "owner", created_at: new Date(),
    approved_by: status === "approved" ? "owner" : null, approved_at: status === "approved" ? new Date() : null, self_approved: true, note: null,
  } as never);
}

describe("fact search (local backend)", () => {
  it("finds approved facts case-insensitively and never returns drafts", async () => {
    const s = await signUpCoordinator(h, "search@example.org", "Search Org");
    await addVersion(s.orgId, "340 students took part in the mentoring program.", "approved");
    await addVersion(s.orgId, "A draft about mentoring that nobody approved.", "draft");
    const hits = await searchFacts(h.deps, s.orgId, "MENTORING");
    expect(hits.map((x) => x.text)).toEqual(["340 students took part in the mentoring program."]);
    expect(hits[0]).toMatchObject({ source: "Annual report 2026", verified_on: "2026-09-15" });
  });

  it("matches literally, so regex characters in a query are not special", async () => {
    const s = await signUpCoordinator(h, "literal@example.org", "Literal Org");
    await addVersion(s.orgId, "Raised 1+1 dollars per camper.", "approved");
    await addVersion(s.orgId, "Raised 11 dollars per camper.", "approved");
    expect((await searchFacts(h.deps, s.orgId, "1+1")).map((x) => x.text)).toEqual(["Raised 1+1 dollars per camper."]);
  });

  it("stays inside the organization", async () => {
    const a = await signUpCoordinator(h, "tenant-a@example.org", "Tenant A");
    const b = await signUpCoordinator(h, "tenant-b@example.org", "Tenant B");
    await addVersion(b.orgId, "Shared word: bridge program.", "approved");
    expect(await searchFacts(h.deps, a.orgId, "bridge")).toEqual([]);
  });

  it("returns nothing for an empty query and caps long queries", async () => {
    const s = await signUpCoordinator(h, "caps@example.org", "Caps Org");
    expect(await searchFacts(h.deps, s.orgId, "   ")).toEqual([]);
    expect(await searchFacts(h.deps, s.orgId, "x".repeat(MAX_QUERY_CHARS + 50))).toEqual([]);
  });

  it("is served over the API to signed-in members", async () => {
    const s = await signUpCoordinator(h, "route@example.org", "Route Org");
    await addVersion(s.orgId, "Summer camp ran for two weeks.", "approved");
    const r = await s.client.get("/api/fact-sheets/search?q=camp");
    expect(r.status).toBe(200);
    expect(r.json.results).toHaveLength(1);
  });
});

describe("fact search (Atlas pipeline shape)", () => {
  it("builds a $search stage on the fact_text index, filtered to the org and approved facts", () => {
    const [stage, limit, project] = atlasSearchPipeline("org-1", "mentoring") as Array<Record<string, any>>;
    expect(stage!.$search.index).toBe("fact_text");
    expect(stage!.$search.compound.filter).toEqual([
      { equals: { path: "org_id", value: "org-1" } },
      { equals: { path: "status", value: "approved" } },
    ]);
    expect(stage!.$search.compound.must[0].text).toMatchObject({ query: "mentoring", path: ["text", "source"], fuzzy: { maxEdits: 1 } });
    expect(limit).toEqual({ $limit: 20 });
    expect(project!.$project.highlights).toEqual({ $meta: "searchHighlights" });
  });
});
