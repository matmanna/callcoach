import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnOutbox } from "../src/lab/turns/outbox.ts";
import type { Turn } from "@sc/shared";
const t = (id: string): Turn => ({ id, speaker: "donor", scrubbed: `scrubbed ${id}`, redactions: [], t: 0 });
const response = (status: number, body: unknown = { seq: 1, cue: null, server_ms: 1 }) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.useRealTimers());
describe("ordered lab outbox", () => {
  it("retries a failed request with backoff and preserves turn order", async () => {
    vi.useFakeTimers(); const seen: string[] = []; let attempts = 0; const replies: string[] = [];
    const outbox = new TurnOutbox("c", (turn) => replies.push(turn.id), undefined, async (_url, init) => { const body = JSON.parse(String(init?.body)); seen.push(body.turn.id); attempts++; return response(attempts === 1 ? 503 : 200); });
    outbox.enqueue(t("a")); outbox.enqueue(t("b")); await vi.runAllTimersAsync(); await Promise.resolve();
    expect(seen).toEqual(["a", "a", "b"]); expect(replies).toEqual(["a", "b"]); expect(outbox.depth).toBe(0);
  });
  it("does not retry 422 and drops the rejected turn", async () => {
    vi.useFakeTimers(); let requests = 0;
    const outbox = new TurnOutbox("c", () => {}, undefined, async () => { requests++; return response(requests === 1 ? 422 : 200, { counts: { email: 1 } }); });
    outbox.enqueue(t("rejected")); outbox.enqueue(t("blocked")); await vi.runAllTimersAsync(); await Promise.resolve();
    expect(requests).toBe(2); expect(outbox.failed[0]?.turn_id).toBe("rejected"); expect(outbox.depth).toBe(0); expect(outbox.isBlocked).toBe(false);
  });
  it("blocks later turns after the documented retries are exhausted", async () => {
    vi.useFakeTimers(); let requests = 0;
    const outbox = new TurnOutbox("c", () => {}, undefined, async () => { requests++; return response(503); });
    outbox.enqueue(t("failed")); outbox.enqueue(t("waiting")); await vi.runAllTimersAsync(); await Promise.resolve();
    expect(requests).toBe(4); expect(outbox.failed[0]?.turn_id).toBe("failed"); expect(outbox.depth).toBe(2); expect(outbox.isBlocked).toBe(true);
  });
  it("retries a dropped pre-send request and sends an injected duplicate once without double-applying the cue", async () => {
    vi.useFakeTimers(); let requests = 0; let replies = 0;
    const outbox = new TurnOutbox("c", () => { replies++; }, undefined, async () => { requests++; return response(200); });
    outbox.inject("drop"); outbox.enqueue(t("dropped")); await vi.runAllTimersAsync();
    expect(requests).toBe(1); expect(replies).toBe(1);
    outbox.inject("duplicate"); outbox.enqueue(t("duplicate")); await vi.runAllTimersAsync();
    expect(requests).toBe(3); expect(replies).toBe(2); expect(outbox.depth).toBe(0);
  });
});
