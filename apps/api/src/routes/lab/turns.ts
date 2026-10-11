import { DonorFile, CueRulesFile, FactSheetFile, PhraseRulesFile, LabMode, LabTurnRequest, Turn } from "@sc/shared";
import { collectTags, scanForIdentifiers, selectCue, validateRules } from "@sc/rules";
import { Hono, type Context } from "hono";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLabSummary } from "../../services/lab/summaryFallback.ts";
import { endRead, rollingRead } from "../../services/lab/bedrockLab.ts";
import { appendEvent, createSession, getSession } from "../../services/lab/turnSession.ts";
import type { LabSession } from "../../services/lab/turnSession.ts";

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../data");
const donor = DonorFile.parse(JSON.parse(readFileSync(resolve(dataDir, "donor.json"), "utf8")));
const cueRules = CueRulesFile.parse(JSON.parse(readFileSync(resolve(dataDir, "cue-rules.json"), "utf8"))).rules;
const facts = FactSheetFile.parse(JSON.parse(readFileSync(resolve(dataDir, "fact-sheet.json"), "utf8"))).facts;
const phraseRules = PhraseRulesFile.parse(JSON.parse(readFileSync(resolve(dataDir, "phrase-rules.json"), "utf8"))).rules;
validateRules(cueRules, facts);

export const labTurns = new Hono();
labTurns.use("*", async (c, next) => { if (process.env.LAB_ENABLED !== "1") return c.notFound(); await next(); });
labTurns.post("/calls", async (c) => {
  const started = performance.now();
  const body = await c.req.json().catch(() => null) as { donor_id?: unknown; mode?: unknown } | null;
  if (!body || typeof body.donor_id !== "string" || body.donor_id !== donor.id) return c.json({ error: "invalid_donor" }, 400);
  const mode = LabMode.safeParse(body.mode); if (!mode.success) return c.json({ error: "invalid_mode" }, 400);
  const call_id = `lab-${crypto.randomUUID()}`; const session = createSession(call_id, body.donor_id, mode.data); const response = { call_id };
  session.wire.push({ kind: "create", bytes: new TextEncoder().encode(JSON.stringify(body)).length, status: 201, ms: performance.now() - started, retries: 0, at: Date.now(), detail: { response_bytes: new TextEncoder().encode(JSON.stringify(response)).length } });
  return c.json(response, 201);
});
function notFound(c: Context<any, any, any>) { return c.json({ error: "not_found" }, 404); }
labTurns.post("/calls/:id/turns", async (c) => {
  const session = getSession(c.req.param("id")); if (!session) return notFound(c);
  const started = performance.now();
  const parsed = LabTurnRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) { session.wire.push({ kind: "turn", bytes: Number(c.req.header("content-length") ?? 0), status: 400, ms: performance.now() - started, retries: 0, at: Date.now() }); return c.json({ error: "invalid_payload" }, 400); }
  const { idempotency_key, turn } = parsed.data;
  const counts = scanForIdentifiers(turn.scrubbed);
  if (Object.values(counts).some((count) => count > 0)) {
    session.wire.push({ kind: "turn", turn_id: turn.id, bytes: JSON.stringify(parsed.data).length, status: 422, ms: performance.now() - started, retries: 0, at: Date.now(), detail: { counts } });
    return c.json({ error: "identifier_detected", counts, turn_id: turn.id }, 422);
  }
  const cached = session.idempotent.get(idempotency_key);
  if (cached) { const bodyBytes = new TextEncoder().encode(JSON.stringify(parsed.data)).length; session.wire.push({ kind: "turn_duplicate", turn_id: turn.id, bytes: bodyBytes, status: 200, ms: performance.now() - started, retries: 0, at: Date.now(), detail: { response_bytes: new TextEncoder().encode(JSON.stringify(cached)).length } }); return c.json(cached); }
  const result = selectCue(turn, cueRules, facts, session.cueState);
  session.cueState = result.state; session.turns.push(turn); session.firedRuleIds.push(...result.matchedRuleIds);
  const cue = result.cue ? { rule_id: result.cue.rule_id, type: result.cue.type, ...(result.cue.tag ? { tag: result.cue.tag } : {}), dnc_candidate: result.dncCandidate } : null;
  const response = { seq: session.turns.length, cue, server_ms: performance.now() - started };
  session.idempotent.set(idempotency_key, response);
  appendEvent(session, "turn", { turn_id: turn.id, response });
  const reqBytes = new TextEncoder().encode(JSON.stringify(parsed.data)).length;
  session.wire.push({ kind: "turn", turn_id: turn.id, bytes: reqBytes, status: 200, ms: response.server_ms, retries: 0, at: Date.now(), detail: { response_bytes: new TextEncoder().encode(JSON.stringify(response)).length } });
  if (session.mode === "rules_rolling" && turn.speaker === "donor" && session.turns.filter((t) => t.speaker === "donor").length % Number(process.env.LAB_ROLLING_EVERY ?? 3) === 0) void rollingRead(session);
  return c.json(response);
});
labTurns.get("/calls/:id/events", (c) => { const started = performance.now(); const s = getSession(c.req.param("id")); if (!s) return notFound(c); const after = Number(c.req.query("after") ?? 0); const response = { events: s.events.filter((e) => e.seq > after) }; const size = new TextEncoder().encode(JSON.stringify(response)).length; s.wire.push({ kind: "events_poll", bytes: 0, status: 200, ms: performance.now() - started, retries: 0, at: Date.now(), detail: { response_bytes: size } }); return c.json(response); });
labTurns.post("/calls/:id/end", async (c) => {
  const started = performance.now();
  const s = getSession(c.req.param("id")); if (!s) return notFound(c);
  const spans = s.turns.map(({ scrubbed, redactions }) => ({ scrubbed, redactions }));
  const tags = collectTags(s.firedRuleIds, spans, cueRules, phraseRules);
  const summary = buildLabSummary(tags, s.turns);
  const noteCharacters = summary.length + tags.join(", ").length;
  let flags: unknown = null; let bedrock: unknown = null; let mock = false;
  if (s.mode !== "rules_only") { const result = await endRead(s, summary, tags); flags = result.value; mock = result.mock; const record = s.bedrock.at(-1); bedrock = record ? { latency_ms: record.latency_ms, input_tokens: record.input_tokens, output_tokens: record.output_tokens, mock } : null; }
  appendEvent(s, "end", { summary, tags, note_characters: noteCharacters });
  const response = { summary, tags, flags, bedrock };
  s.wire.push({ kind: "end", bytes: 0, status: 200, ms: performance.now() - started, retries: 0, at: Date.now(), detail: { response_bytes: new TextEncoder().encode(JSON.stringify(response)).length, note_characters: noteCharacters } });
  return c.json(response);
});
labTurns.get("/calls/:id/export", (c) => { const s = getSession(c.req.param("id")); if (!s) return notFound(c); return c.json({ call_id: s.call_id, mode: s.mode, requests: s.wire, bedrock: s.bedrock, events: s.events.map(({ seq, type, at, data }) => ({ seq, type, at, data })), turns: s.turns.map((turn: Turn) => ({ ...turn })) }); });
