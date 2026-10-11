import { describe, expect, it } from "vitest";
import { contactRoutes } from "../src/routes/contact.ts";

const valid = { name: "Test Person", email: "test@example.org", organization: "Example Org", role: "Coordinator", team_size: "6-15", message: "Synthetic message." };

function post(body: unknown) {
  const lines: string[] = [];
  const app = contactRoutes((l) => lines.push(l));
  return { lines, res: app.request("/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) };
}

describe("POST /api/contact stub", () => {
  it("accepts a valid request and returns a confirmation", async () => {
    const { res, lines } = post(valid);
    const r = await res;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
    expect(lines).toHaveLength(1);
  });

  it("logs no name, email, organization, or message text", async () => {
    const { res, lines } = post(valid);
    await res;
    for (const v of [valid.name, valid.email, valid.organization, valid.message]) expect(lines.join("\n")).not.toContain(v);
  });

  it("rejects missing fields with paths only, never values", async () => {
    const { res, lines } = post({ ...valid, name: "", email: "not-an-email" });
    const r = await res;
    expect(r.status).toBe(400);
    const body = JSON.stringify(await r.json());
    expect(body).toContain("name");
    expect(body).not.toContain("not-an-email");
    expect(lines).toHaveLength(0);
  });
});
