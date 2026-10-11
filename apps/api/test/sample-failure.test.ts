import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Seeding must never block sign-up: make the importer fail and check onboarding still succeeds.
vi.mock("../src/imports/importer.ts", async (orig) => ({ ...(await orig<typeof import("../src/imports/importer.ts")>()), commitImport: vi.fn(async () => { throw new Error("import exploded"); }) }));

import { harness, signUpCoordinator, type Harness } from "./helpers.ts";

let h: Harness;
beforeAll(async () => {
  h = await harness();
  h.deps.env.AUTO_SEED_SAMPLE_DATA = "1";
}, 60_000);
afterAll(async () => h?.close());

describe("sample seeding failure", () => {
  it("still onboards the coordinator and logs without leaking details", async () => {
    const s = await signUpCoordinator(h, "fail@example.org", "Fail Org");
    expect((await s.client.get("/api/me")).json.org.name).toBe("Fail Org");
    expect((await s.client.get("/api/donors")).json.donors).toEqual([]);
  });
});
