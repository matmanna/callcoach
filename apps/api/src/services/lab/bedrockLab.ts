import { ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { DEFAULT_ENABLED_FLAGS, FlagLabel, FlagResult, LabFlagResult } from "@sc/shared";
import { hasIdentifiers } from "@sc/rules";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createBedrockClient, bedrockModelId } from "../../bedrock.ts";
import { appendEvent, type LabSession } from "./turnSession.ts";

const promptDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../data/lab/prompts");
const rollingPrompt = readFileSync(resolve(promptDir, "rolling.txt"), "utf8");
const endPrompt = readFileSync(resolve(promptDir, "end-of-call.txt"), "utf8");
const enabled = DEFAULT_ENABLED_FLAGS;
const countTokens = (s: string) => Math.ceil(s.length / 4);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type LabConverseSender = (command: ConverseCommand) => Promise<ConverseCommandOutput>;
let converseSender: LabConverseSender = (command) => createBedrockClient().send(command, { abortSignal: AbortSignal.timeout(10_000) });
export function setLabConverseSenderForTests(sender?: LabConverseSender) {
  converseSender = sender ?? ((command) => createBedrockClient().send(command, { abortSignal: AbortSignal.timeout(10_000) }));
}
export function parseLabModelOutput(text: string, mode: "rolling" | "end"): unknown | null {
  let raw: unknown; try { raw = JSON.parse(text); } catch { return null; }
  const parsed = (mode === "end" ? FlagResult : LabFlagResult).safeParse(raw);
  if (!parsed.success) return null;
  if (mode === "rolling") {
    const label = (parsed.data as { label: string | null }).label;
    if (label !== null && !enabled.some((allowed) => allowed === label)) return null;
  }
  return parsed.data;
}
function record(session: LabSession, value: { mode: string; status: string; mock: boolean; latency_ms: number; response_latency_ms: number | null; input_tokens: number; output_tokens: number; detail?: Record<string, unknown> }) {
  session.bedrock.push({ ...value, at: Date.now() });
  appendEvent(session, "bedrock", { ...value });
}
function mockResult(input: string, isEnd: boolean): unknown {
  const text = input.toLowerCase();
  if (isEnd) {
    const flags: Array<{ label: string; reason: string }> = [];
    if (/passed away|miss (him|her)|loss|family_deceased_recent|hardship/.test(text)) flags.push({ label: "DISTRESS", reason: "The provided summary mentions a sensitive category." });
    if (/stop.contact|stop_contact_requested|no phone calls/.test(text)) flags.push({ label: "STOP_CONTACT", reason: "The provided tags indicate a contact preference." });
    return { flags };
  }
  const label = /passed away|miss (him|her)|loss/.test(text) ? "DISTRESS" : /stop calling|take me off|don't call/.test(text) ? "STOP_CONTACT" : /false|claim/.test(text) ? "OFF_SCRIPT_CLAIM" : null;
  return { label, reason: label ? "Keyword match in supplied scrubbed text." : "No enabled label clearly matched." };
}
async function invoke(session: LabSession, mode: "rolling" | "end", input: string): Promise<{ value: unknown | null; mock: boolean }> {
  if (hasIdentifiers(input)) { record(session, { mode, status: "blocked_identifier", mock: false, latency_ms: 0, response_latency_ms: null, input_tokens: 0, output_tokens: 0 }); return { value: null, mock: false }; }
  const cap = Number(process.env.LAB_MAX_BEDROCK_CALLS ?? 15);
  if (session.bedrockCalls >= cap) { appendEvent(session, "bedrock_cap_reached", { mode, cap }); record(session, { mode, status: "cap_reached", mock: false, latency_ms: 0, response_latency_ms: null, input_tokens: 0, output_tokens: 0 }); return { value: null, mock: false }; }
  session.bedrockCalls++;
  const mock = process.env.MOCK_BEDROCK === "1";
  const started = Date.now();
  if (mock) {
    await sleep(300 + (input.length % 601));
    const raw = mockResult(input, mode === "end");
    const parsed = (mode === "end" ? FlagResult : LabFlagResult).safeParse(raw);
    const latency = Date.now() - started;
    const mockPrompt = mode === "rolling" ? `${rollingPrompt}\nEnabled labels: ${enabled.join(", ")}` : endPrompt;
    record(session, { mode, status: parsed.success ? "ok" : "invalid", mock: true, latency_ms: latency, response_latency_ms: latency, input_tokens: countTokens(`${mockPrompt}\n${input}`), output_tokens: countTokens(JSON.stringify(raw)) });
    return { value: parsed.success ? parsed.data : null, mock: true };
  }
  const prompt = mode === "rolling" ? `${rollingPrompt}\nEnabled labels: ${enabled.join(", ")}\nTurns:\n${input}` : `${endPrompt}\n${input}`;
  const body = { modelId: bedrockModelId(), system: [{ text: prompt }], messages: [{ role: "user" as const, content: [{ text: "Return only the required JSON object." }] }], inferenceConfig: { temperature: 0, maxTokens: 300 } };
  let response: ConverseCommandOutput | undefined;
  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    try { response = await converseSender(new ConverseCommand(body)); break; }
    catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (attempts >= 2 || !/Throttl|TooManyRequests/i.test(name)) break;
      await sleep(250);
    }
  }
  const latency = Date.now() - started;
  const text = response?.output?.message?.content?.map((part) => part.text ?? "").join("").trim() ?? "";
  const value = parseLabModelOutput(text, mode);
  const ok = value !== null;
  const usage = response?.usage;
  record(session, { mode, status: ok ? "ok" : "invalid", mock: false, latency_ms: latency, response_latency_ms: response?.metrics?.latencyMs ?? null, input_tokens: usage?.inputTokens ?? 0, output_tokens: usage?.outputTokens ?? 0 });
  return { value: ok ? value : null, mock: false };
}
export function rollingRead(session: LabSession): Promise<void> {
  const windowSize = Number(process.env.LAB_ROLLING_WINDOW ?? 6);
  const windowTurns = session.turns.slice(-windowSize);
  const input = windowTurns.map((turn) => `${turn.speaker.toUpperCase()}: ${turn.scrubbed}`).join("\n");
  const anchor = [...windowTurns].reverse().find((turn) => turn.speaker === "donor");
  return invoke(session, "rolling", input).then(({ value, mock }) => { appendEvent(session, "rolling_read", { value: value ?? { status: "invalid" }, mock, anchor_turn_id: anchor?.id ?? null }); });
}
export async function endRead(session: LabSession, summary: string, tags: readonly string[]) {
  return invoke(session, "end", `Summary: ${summary}\nTags: ${tags.join(", ")}`);
}
