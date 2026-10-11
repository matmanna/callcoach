import { describe, expect, it } from "vitest";
import { app } from "../src/app.ts";

const post = (path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("api stubs", () => {
  it("GET /health is 200", async () => {
    expect((await app.request("/health")).status).toBe(200);
  });

  it("POST /approve validates then returns 501", async () => {
    const ok = {
      idempotency_key: "k",
      donor_ref: "d-102",
      consent_ts: "2026-10-11T14:00:00Z",
      summary: "s",
      tags: [],
      redaction_counts: {},
      client_version: "0",
    };
    expect((await post("/approve", ok)).status).toBe(501);
    const bad = await post("/approve", { ...ok, raw: "secret text" });
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain("secret text");
  });

  it("POST /flag validates then returns 501", async () => {
    expect((await post("/flag", { flags: [] })).status).toBe(501);
    expect((await post("/flag", { flags: [{ label: "NOPE", reason: "x" }] })).status).toBe(400);
  });
});
