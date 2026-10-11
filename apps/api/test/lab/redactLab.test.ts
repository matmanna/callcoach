import type { ConverseCommand, ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it, vi } from "vitest";
import { labRoutes } from "../../src/routes/lab/index.ts";
import { redactLab } from "../../src/routes/lab/redact.ts";
import { CallBudget, flagNote, parseModelOutput, systemPrompt, type ConverseClient } from "../../src/services/lab/bedrockNote.ts";

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

function fakeClient(text: string | (() => never)): ConverseClient & { calls: number } {
  const client = {
    calls: 0,
    async send(_cmd: ConverseCommand): Promise<ConverseCommandOutput> {
      client.calls += 1;
      if (typeof text === "function") text();
      return {
        output: { message: { role: "assistant", content: [{ text: text as string }] } },
        usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
        metrics: { latencyMs: 456 },
        stopReason: "end_turn",
        $metadata: {},
      };
    },
  };
  return client;
}

const SCRUBBED = "DONOR: [FAMILY: deceased, recent] in March.\nVOLUNTEER: I'm so sorry, [NAME].";
const deps = (client: ConverseClient, max = 40) => ({ mock: false, client, modelId: "test-model", budget: new CallBudget(max), sleep: async () => {} });

describe("lab gating", () => {
  it("404s unless LAB_ENABLED=1", async () => {
    const off = labRoutes({});
    expect((await off.request("/redact/guard", json({ text: "x" }))).status).toBe(404);
    const on = labRoutes({ LAB_ENABLED: "1", MOCK_BEDROCK: "1" });
    expect((await on.request("/redact/guard", json({ text: "x" }))).status).toBe(200);
  });
});

describe("POST /send", () => {
  const app = redactLab({ env: { MOCK_BEDROCK: "1" }, deps: { sleep: async () => {} } });

  it("rejects a raw key with 400", async () => {
    const res = await app.request("/send", json({ variant: "A", text: SCRUBBED, raw: "Rosalind Featherstone" }));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("Rosalind");
  });

  it("enforces per-variant fields", async () => {
    expect((await app.request("/send", json({ variant: "N", text: SCRUBBED }))).status).toBe(400);
    expect((await app.request("/send", json({ variant: "M", summary: "x", tags: [] }))).status).toBe(400);
    expect((await app.request("/send", json({ variant: "N", summary: "x", tags: ["NOPE"] }))).status).toBe(400);
  });

  it("blocks a payload with an identifier and returns counts only", async () => {
    const res = await app.request("/send", json({ variant: "M", text: "DONOR: call me at 814-555-0142 or r@example.org" }));
    expect(res.status).toBe(422);
    const body = await res.text();
    expect(body).not.toContain("555");
    expect(body).not.toContain("example.org");
    expect(JSON.parse(body)).toMatchObject({ status: "blocked", guard_counts: { phone: 1, email: 1, address: 0, dob: 0 }, flags: [] });
  });

  it("returns mock flags marked mock", async () => {
    const res = await app.request("/send", json({ variant: "N", summary: "Donor mentioned a recent family loss.", tags: ["FAMILY_DECEASED_RECENT"] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { payload_chars: number };
    expect(body).toMatchObject({ status: "ok", mock: true, flags: [{ label: "DISTRESS" }] });
    expect(body.payload_chars).toBe("NOTE: Donor mentioned a recent family loss.\nTAGS: FAMILY_DECEASED_RECENT".length);
  });
});

describe("guard endpoint", () => {
  it("returns comprehend: null when disabled, and types/counts only when enabled", async () => {
    const off = redactLab({ env: {} });
    expect(await (await off.request("/guard", json({ text: "x" }))).json()).toEqual({
      guard_counts: { phone: 0, email: 0, address: 0, dob: 0 },
      comprehend: null,
    });
    const send = vi.fn(async () => ({ Entities: [{ Type: "NAME", BeginOffset: 0, EndOffset: 4 }, { Type: "NAME" }, { Type: "ADDRESS" }] }));
    const on = redactLab({ env: { COMPREHEND_ENABLED: "1" }, comprehend: { send } });
    const body = (await (await on.request("/guard", json({ text: "Some text" }))).json()) as { comprehend: unknown };
    expect(body.comprehend).toEqual({ NAME: 2, ADDRESS: 1 });
  });
});

describe("flagNote with a mocked Bedrock client", () => {
  it("accepts valid JSON", async () => {
    const client = fakeClient('{"flags":[{"label":"DISTRESS","reason":"Donor describes a recent loss."}]}');
    const r = await flagNote({ variant: "A", text: SCRUBBED }, deps(client));
    expect(r).toMatchObject({ status: "ok", flags: [{ label: "DISTRESS" }], input_tokens: 120, output_tokens: 30, response_latency_ms: 456, mock: false });
  });

  it("marks malformed JSON invalid with zero flags", async () => {
    const r = await flagNote({ variant: "A", text: SCRUBBED }, deps(fakeClient("Sure! Here are the flags: DISTRESS")));
    expect(r.status).toBe("invalid");
    expect(r.flags).toEqual([]);
  });

  it("drops and records out-of-enum labels; truncates reasons", async () => {
    const long = "x".repeat(300);
    const client = fakeClient(`{"flags":[{"label":"PLANNED_GIVING","reason":"r"},{"label":"MADE_UP","reason":"r"},{"label":"DISTRESS","reason":"${long}"}]}`);
    const r = await flagNote({ variant: "A", text: SCRUBBED }, deps(client));
    expect(r.flags.map((f) => f.label)).toEqual(["DISTRESS"]);
    expect(r.flags[0]!.reason).toHaveLength(160);
    expect(r.dropped_labels).toEqual(["PLANNED_GIVING", "MADE_UP"]);
  });

  it("enforces the call cap", async () => {
    const client = fakeClient('{"flags":[]}');
    const d = deps(client, 2);
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await flagNote({ variant: "A", text: SCRUBBED }, d));
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "capped"]);
    expect(client.calls).toBe(2);
  });

  it("does not call Bedrock when the guard blocks", async () => {
    const client = fakeClient('{"flags":[]}');
    const r = await flagNote({ variant: "M", text: "DONOR: 12 Elm St" }, deps(client));
    expect(r.status).toBe("blocked");
    expect(client.calls).toBe(0);
  });

  it("retries once on throttling, then reports the error name only", async () => {
    let n = 0;
    const client: ConverseClient = {
      async send() {
        n += 1;
        const e = new Error("rate exceeded for DONOR text");
        e.name = "ThrottlingException";
        throw e;
      },
    };
    const r = await flagNote({ variant: "A", text: SCRUBBED }, deps(client));
    expect(n).toBe(2);
    expect(r).toMatchObject({ status: "error", error: "ThrottlingException" });
  });
});

describe("prompt", () => {
  it("lists only enabled labels and the human-review rule", () => {
    const p = systemPrompt();
    expect(p).toContain("DISTRESS");
    expect(p).toContain("OFF_SCRIPT_CLAIM");
    expect(p).not.toContain("PLANNED_GIVING");
    expect(p).toMatch(/human coordinator/);
    expect(p).toMatch(/Do not infer financial status, health conditions, or intent/);
  });
  it("parseModelOutput strips code fences", () => {
    expect(parseModelOutput('```json\n{"flags":[]}\n```')).toEqual({ status: "ok", flags: [], dropped_labels: [] });
  });
});
