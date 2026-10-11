import { describe, expect, it } from "vitest";
import { buildKnownIdentifiers, initialCueState, redactTurn, selectCue } from "@sc/rules";
import type { LabMode, RawTurn } from "@sc/shared";
import fixtureJson from "../../../data/transcript.json";
import donorJson from "../../../data/donor.json";
import rulesJson from "../../../data/cue-rules.json";
import factsJson from "../../../data/fact-sheet.json";
import phraseJson from "../../../data/phrase-rules.json";
import { DonorFile, CueRulesFile, FactSheetFile, PhraseRulesFile, TranscriptFixture } from "@sc/shared";
import { app } from "../src/app.ts";
import { TranscriptDriver } from "../../web/src/lab/turns/driver.ts";

const fixture = TranscriptFixture.parse(fixtureJson); const donor = DonorFile.parse(donorJson);
const rules = CueRulesFile.parse(rulesJson).rules; const facts = FactSheetFile.parse(factsJson).facts; const phrases = PhraseRulesFile.parse(phraseJson).rules;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
interface Metric { mode: LabMode; run: string; p50: number; p95: number; chars: number; noteCharacters: number; calls: number; inputTokens: number; outputTokens: number; bedrockLatencies: number[]; agree: number; rulesOnly: number; bedrockOnly: number; different: number }
async function experiment(mode: LabMode, run: string, fault?: "drop" | "delay" | "duplicate"): Promise<Metric> {
  const created = await app.request("/lab/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ donor_id: fixture.donor_id, mode }) });
  const { call_id } = await created.json() as { call_id: string };
  let cueState = initialCueState(); const expected = new Map<string, string | null>(); const latencies: number[] = []; let chars = 0; let faultUsed = false;
  const allTurns = fixture.turns as RawTurn[]; const scheduled: RawTurn[] = []; let virtualNow = 0; let priorT = 0;
  const speed = run.startsWith("10x") ? 10 : 1;
  const driver = new TranscriptDriver(allTurns, (turn) => scheduled.push(turn), () => virtualNow); driver.start(); driver.setSpeed(speed);
  for (const expectedTurn of allTurns) {
    virtualNow += (expectedTurn.t - priorT) / speed; priorT = expectedTurn.t; driver.tick();
    const raw = scheduled.shift(); expect(raw?.id).toBe(expectedTurn.id); if (!raw) throw new Error("playback driver missed a scripted turn");
    const emittedAt = performance.now();
    const turn = redactTurn(raw, { known: buildKnownIdentifiers(donor, fixture.volunteer_name ?? ""), phraseRules: phrases });
    const selected = selectCue(turn, rules, facts, cueState); cueState = selected.state;
    expected.set(turn.id, selected.cue?.type === "distress" ? "DISTRESS" : selected.cue?.type === "stop_contact" ? "STOP_CONTACT" : null);
    const key = `${call_id}:${turn.id}`; const requestBody = { idempotency_key: key, turn };
    if (fault === "delay" && !faultUsed) { await sleep(2000); faultUsed = true; }
    // A dropped client attempt throws before sending; the outbox's first retry then succeeds.
    if (fault === "drop" && !faultUsed) { faultUsed = true; await sleep(250); }
    const response = await app.request(`/lab/calls/${call_id}/turns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
    const body = await response.json() as { cue: { rule_id: string } | null };
    expect(response.status).toBe(200); expect(body.cue?.rule_id ?? null).toBe(selected.cue?.rule_id ?? null);
    latencies.push(performance.now() - emittedAt); chars += turn.scrubbed.length;
    if (fault === "duplicate" && !faultUsed) {
      const duplicate = await app.request(`/lab/calls/${call_id}/turns`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
      expect(await duplicate.json()).toEqual(body); chars += turn.scrubbed.length; faultUsed = true;
    }
  }
  if (mode === "rules_rolling") {
    // Both rolling reads start without awaiting the turn response; the deterministic mock delay is at most 900 ms.
    await sleep(950);
  }
  const ended = await app.request(`/lab/calls/${call_id}/end`, { method: "POST" }); const end = await ended.json() as { summary: string; tags: string[] };
  const exported = await (await app.request(`/lab/calls/${call_id}/export`)).json() as { bedrock: Array<{ input_tokens: number; output_tokens: number; latency_ms: number }>; events: Array<{ type: string; data: Record<string, unknown> }> };
  const reads = exported.events.filter((e) => e.type === "rolling_read"); let agree = 0, rulesOnly = 0, bedrockOnly = 0, different = 0;
  if (mode === "rules_rolling") expect(reads).toHaveLength(2);
  for (const event of reads) {
    const anchor = String(event.data.anchor_turn_id); const expectedLabel = expected.get(anchor) ?? null;
    const label = (event.data.value as { label?: string | null }).label ?? null;
    if (expectedLabel && label === expectedLabel) agree++; else if (expectedLabel && !label) rulesOnly++; else if (!expectedLabel && label) bedrockOnly++; else if (expectedLabel && label) different++;
  }
  const sorted = [...latencies].sort((a, b) => a - b); const q = (p: number) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
  expect(end.summary.length).toBeLessThanOrEqual(400);
  return { mode, run, p50: q(.5), p95: q(.95), chars, noteCharacters: end.summary.length + end.tags.join(", ").length, calls: exported.bedrock.length, inputTokens: exported.bedrock.reduce((n, b) => n + b.input_tokens, 0), outputTokens: exported.bedrock.reduce((n, b) => n + b.output_tokens, 0), bedrockLatencies: exported.bedrock.map((b) => b.latency_ms), agree, rulesOnly, bedrockOnly, different };
}
describe("lab scripted turn experiment", () => {
  it("replays the synthetic fixture in all modes and at accelerated speed with each injected fault", async () => {
    process.env.LAB_ENABLED = "1"; process.env.MOCK_BEDROCK = "1"; process.env.LAB_ROLLING_EVERY = "3"; process.env.LAB_ROLLING_WINDOW = "6"; process.env.LAB_MAX_BEDROCK_CALLS = "15";
    const modes: LabMode[] = ["rules_only", "rules_end", "rules_rolling"]; const results: Metric[] = [];
    for (const mode of modes) for (let i = 1; i <= 3; i++) results.push(await experiment(mode, `1x-${i}`));
    for (const mode of modes) for (const fault of ["drop", "delay", "duplicate"] as const) results.push(await experiment(mode, `10x-${fault}`, fault));
    console.log("LAB_EXPERIMENT_METRICS", JSON.stringify(results));
    expect(results).toHaveLength(18);
    expect(results.filter((r) => r.mode === "rules_only").every((r) => r.calls === 0)).toBe(true);
    const baselineCharacters = fixture.turns.reduce((n, t) => n + redactTurn(t, { known: buildKnownIdentifiers(donor, fixture.volunteer_name ?? ""), phraseRules: phrases }).scrubbed.length, 0);
    const firstTurnCharacters = redactTurn(fixture.turns[0] as RawTurn, { known: buildKnownIdentifiers(donor, fixture.volunteer_name ?? ""), phraseRules: phrases }).scrubbed.length;
    expect(results.filter((r) => r.run.includes("duplicate")).every((r) => r.chars === baselineCharacters + firstTurnCharacters)).toBe(true);
  }, 30_000);
});
