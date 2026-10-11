import type { Turn } from "@sc/shared";
export interface TurnReply { seq: number; cue: { rule_id: string; type: string; tag?: string; dnc_candidate: boolean } | null; server_ms: number }
export interface OutboxItem { turn: Turn; key: string; bytes: number; queuedAt: number; retries: number }
export type Fault = "drop" | "delay" | "duplicate";
export class TurnOutbox {
  private queue: OutboxItem[] = [];
  private inFlight = false;
  private blocked = false;
  private faults: Fault[] = [];
  private retryCounts = new Map<string, number>();
  failed: Array<{ turn_id: string; error: string }> = [];
  constructor(private readonly callId: string, private readonly onReply: (turn: Turn, reply: TurnReply, retries: number, bytes: number) => void, private readonly onChange: () => void = () => {}, private readonly fetcher: typeof fetch = fetch, private readonly onWire: (turn: Turn, bytes: number, status: number, ms: number, retries: number, sent: boolean) => void = () => {}) {}
  inject(fault: Fault) { this.faults.push(fault); }
  enqueue(turn: Turn) { const item: OutboxItem = { turn, key: `${this.callId}:${turn.id}`, bytes: new TextEncoder().encode(JSON.stringify({ idempotency_key: `${this.callId}:${turn.id}`, turn })).length, queuedAt: Date.now(), retries: 0 }; this.queue.push(item); this.onChange(); void this.pump(); }
  get depth() { return this.queue.length; }
  get oldestAgeMs() { return this.queue.length ? Date.now() - (this.queue[0]?.queuedAt ?? Date.now()) : 0; }
  get isBlocked() { return this.blocked; }
  async waitUntilSettled() { while ((this.inFlight || this.queue.length > 0) && !this.blocked) await new Promise((resolve) => setTimeout(resolve, 20)); }
  private async pump() {
    if (this.inFlight || this.blocked) return;
    const item = this.queue[0]; if (!item) return;
    this.inFlight = true; this.onChange();
    let responseReceived = true;
    let requestWasAttempted = false;
    try {
      while (true) {
        const fault = this.faults.shift();
        if (fault === "drop") throw new Error("injected drop before send");
        if (fault === "delay") await new Promise((resolve) => setTimeout(resolve, 2000));
        const sentAt = performance.now();
        responseReceived = false;
        requestWasAttempted = true;
        const response = await this.fetcher(`/lab/calls/${encodeURIComponent(this.callId)}/turns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotency_key: item.key, turn: item.turn }) });
        responseReceived = true;
        this.onWire(item.turn, item.bytes, response.status, performance.now() - sentAt, item.retries, true);
        const body = await response.json() as TurnReply & { error?: string; counts?: Record<string, number> };
        if (fault === "duplicate") { const duplicateAt = performance.now(); responseReceived = false; requestWasAttempted = true; const duplicate = await this.fetcher(`/lab/calls/${encodeURIComponent(this.callId)}/turns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotency_key: item.key, turn: item.turn }) }); responseReceived = true; this.onWire(item.turn, item.bytes, duplicate.status, performance.now() - duplicateAt, item.retries, true); }
        if (response.status === 422) { this.failed.push({ turn_id: item.turn.id, error: `422 identifier guard: ${JSON.stringify(body.counts ?? {})}` }); this.queue.shift(); this.onChange(); break; }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.onReply(item.turn, body, item.retries, item.bytes); this.queue.shift(); this.onChange(); break;
      }
    } catch (error) {
      if (!responseReceived) this.onWire(item.turn, item.bytes, 0, 0, item.retries, requestWasAttempted);
      const attempt = (this.retryCounts.get(item.key) ?? 0) + 1; this.retryCounts.set(item.key, attempt); item.retries = attempt;
      if (attempt <= 3) { await new Promise((resolve) => setTimeout(resolve, [250, 500, 1000][attempt - 1])); }
      else { this.failed.push({ turn_id: item.turn.id, error: error instanceof Error ? error.message : "network failure" }); this.blocked = true; }
    } finally { this.inFlight = false; this.onChange(); if (this.queue.length && !this.blocked) void this.pump(); }
  }
}
