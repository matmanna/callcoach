/**
 * LAB ONLY (Prompt D). Sends one privacy-preserving input to Bedrock and returns flag
 * suggestions. Never receives raw text: M/A get scrubbed transcript text, N gets the note.
 */
import { readFileSync } from "node:fs";
import { ConverseCommand, type ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { scanForIdentifiers, type IdentifierCounts } from "@sc/rules";
import { DEFAULT_ENABLED_FLAGS, FlagResult, type FlagLabel, type Tag } from "@sc/shared";
import { z } from "zod";

export type Variant = "M" | "A" | "N";

export type LabInput = { variant: "M" | "A"; text: string } | { variant: "N"; summary: string; tags: readonly Tag[] };

export type LabStatus = "ok" | "invalid" | "blocked" | "capped" | "error";

export interface LabFlagResult {
  status: LabStatus;
  flags: FlagResult["flags"];
  dropped_labels: string[];
  latency_ms: number;
  response_latency_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  payload_chars: number;
  guard_counts: IdentifierCounts;
  mock: boolean;
  error?: string;
}

/** Minimal surface of BedrockRuntimeClient we use, so tests can inject a fake. */
export interface ConverseClient {
  send(command: ConverseCommand, options?: { abortSignal?: AbortSignal }): Promise<ConverseCommandOutput>;
}

export const ENABLED_LABELS: readonly FlagLabel[] = DEFAULT_ENABLED_FLAGS;
export const TIMEOUT_MS = 10_000;
export const MAX_TOKENS = 300;
export const MAX_CONCURRENCY = 2;

const LABEL_DEFINITIONS: Record<FlagLabel, string> = {
  DISTRESS: "the donor expresses grief, loss, or emotional distress",
  STOP_CONTACT: "the donor asks, directly or indirectly, not to be contacted this way again",
  OFF_SCRIPT_CLAIM: "the volunteer states something factually wrong or unapproved (for example about taxes, guarantees, or program results)",
  PLANNED_GIVING: "the donor mentions a bequest or will",
  ENGAGE_MORE: "the donor asks to be more involved",
};

const PROMPT_PATH = new URL("../../../../../data/lab/prompts/flag-note.txt", import.meta.url);

export function systemPrompt(template = readFileSync(PROMPT_PATH, "utf8")): string {
  const labels = ENABLED_LABELS.map((l) => `- ${l}: ${LABEL_DEFINITIONS[l]}`).join("\n");
  return template.replace("{{LABELS}}", labels);
}

/** The exact text the model sees. The guard runs on this string. */
export function outboundText(input: LabInput): string {
  if (input.variant === "N") return `NOTE: ${input.summary}\nTAGS: ${input.tags.length ? input.tags.join(", ") : "(none)"}`;
  return input.text;
}

const LooseFlags = z.object({ flags: z.array(z.object({ label: z.string(), reason: z.string() })) });

/** Model output is untrusted: strict JSON, labels outside the enabled list dropped, reasons cut to 160. */
export function parseModelOutput(text: string): { status: "ok"; flags: FlagResult["flags"]; dropped_labels: string[] } | { status: "invalid" } {
  let json: unknown;
  try {
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { status: "invalid" };
  }
  const loose = LooseFlags.safeParse(json);
  if (!loose.success) return { status: "invalid" };
  const dropped: string[] = [];
  const flags: FlagResult["flags"] = [];
  for (const f of loose.data.flags) {
    if ((ENABLED_LABELS as readonly string[]).includes(f.label)) flags.push({ label: f.label as FlagLabel, reason: f.reason.slice(0, 160) });
    else dropped.push(f.label.slice(0, 40));
  }
  return { status: "ok", flags: FlagResult.parse({ flags }).flags, dropped_labels: dropped };
}

/** Deterministic keyword stand-in for Bedrock. Measures plumbing only, never model quality. */
const MOCK_RULES: ReadonlyArray<[FlagLabel, RegExp]> = [
  ["DISTRESS", /\b(family loss|passed away|died|funeral|grief|grieving|miss (him|her)|deceased)\b/i],
  ["STOP_CONTACT", /\b(stop calling|take me off|don't call|do not call|not to be contacted)\b/i],
  ["OFF_SCRIPT_CLAIM", /\b(tax deductible|write off|guaranteed?)\b/i],
];

export function mockFlags(text: string): FlagResult["flags"] {
  return MOCK_RULES.filter(([, re]) => re.test(text)).map(([label]) => ({ label, reason: "MOCK keyword match." }));
}

/** Per-run call cap. */
export class CallBudget {
  used = 0;
  constructor(readonly max: number) {}
  take(): boolean {
    if (this.used >= this.max) return false;
    this.used += 1;
    return true;
  }
}

/** Bounds concurrent outbound calls. */
export class Semaphore {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private readonly limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.waiting.push(r));
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

export interface FlagDeps {
  mock: boolean;
  client?: ConverseClient;
  modelId?: string;
  budget: CallBudget;
  semaphore?: Semaphore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  prompt?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isThrottle(err: unknown): boolean {
  return err instanceof Error && (err.name === "ThrottlingException" || err.name === "TooManyRequestsException");
}

export async function flagNote(input: LabInput, deps: FlagDeps): Promise<LabFlagResult> {
  const now = deps.now ?? (() => performance.now());
  const sleep = deps.sleep ?? defaultSleep;
  const text = outboundText(input);
  const guard_counts = scanForIdentifiers(text);
  const base: LabFlagResult = {
    status: "ok",
    flags: [],
    dropped_labels: [],
    latency_ms: 0,
    response_latency_ms: null,
    input_tokens: 0,
    output_tokens: 0,
    payload_chars: text.length,
    guard_counts,
    mock: deps.mock,
  };
  if (guard_counts.phone + guard_counts.email + guard_counts.address + guard_counts.dob > 0) return { ...base, status: "blocked" };
  if (!deps.budget.take()) return { ...base, status: "capped" };

  const run = async (): Promise<LabFlagResult> => {
    const started = now();
    if (deps.mock) {
      const simulated = 40 + (text.length % 60);
      await sleep(simulated);
      return {
        ...base,
        flags: mockFlags(text),
        latency_ms: Math.round(now() - started),
        response_latency_ms: simulated,
        input_tokens: Math.ceil(text.length / 4),
        output_tokens: 20,
      };
    }
    if (!deps.client || !deps.modelId) return { ...base, status: "error", error: "bedrock_not_configured" };

    const command = new ConverseCommand({
      modelId: deps.modelId,
      system: [{ text: deps.prompt ?? systemPrompt() }],
      messages: [{ role: "user", content: [{ text }] }],
      inferenceConfig: { temperature: 0, maxTokens: MAX_TOKENS },
    });
    let response: ConverseCommandOutput | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2 && !response; attempt++) {
      try {
        response = await deps.client.send(command, { abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (err) {
        lastError = err;
        if (!isThrottle(err) || attempt === 1) break;
        await sleep(1000);
      }
    }
    const latency_ms = Math.round(now() - started);
    if (!response) {
      // Error name only; never echo request content.
      const name = lastError instanceof Error ? lastError.name : "unknown";
      return { ...base, status: "error", latency_ms, error: name };
    }
    const outText = (response.output?.message?.content ?? []).map((c) => ("text" in c && c.text ? c.text : "")).join("");
    const usage = {
      latency_ms,
      response_latency_ms: response.metrics?.latencyMs ?? null,
      input_tokens: response.usage?.inputTokens ?? 0,
      output_tokens: response.usage?.outputTokens ?? 0,
    };
    const parsed = parseModelOutput(outText);
    if (parsed.status === "invalid") return { ...base, ...usage, status: "invalid" };
    return { ...base, ...usage, flags: parsed.flags, dropped_labels: parsed.dropped_labels };
  };
  return deps.semaphore ? deps.semaphore.run(run) : run();
}
