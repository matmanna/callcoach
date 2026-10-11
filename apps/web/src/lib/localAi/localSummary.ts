/**
 * Optional local LLM summary via Ollama on 127.0.0.1:11434. Input is SCRUBBED turns only.
 * Output is untrusted: Zod-validated, tags outside the enum dropped, and any identifier
 * (regex guard or known identifier) rejects the summary in favour of the template.
 */
import { buildDraftSummary, hasIdentifiers, type DraftSummaryInput, type KnownIdentifier } from "@sc/rules";
import { Tag, type Turn } from "@sc/shared";
import { z } from "zod";

export const OLLAMA_URL = "http://127.0.0.1:11434/api/chat";
export const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";

const SYSTEM = [
  "You summarize a volunteer's thank-you call to a donor. Identifiers are already replaced by placeholders like [NAME].",
  "Write at most 300 characters. Do not include names, places, numbers, or placeholders. Do not quote the call.",
  "State only what the text says; do not infer finances, health, or intent.",
  `Choose tags only from: ${Tag.options.join(", ")}.`,
  'Respond with JSON only: {"summary": "...", "tags": ["..."]}',
].join("\n");

const LlmOutput = z.object({ summary: z.string().max(400), tags: z.array(z.string()) });

export type LocalSummaryResult =
  | { source: "llm"; summary: string; tags: Tag[]; dropped_tags: string[]; latency_ms: number }
  | { source: "template"; summary: string; tags: Tag[]; rejected: "unreachable" | "invalid" | "identifier"; latency_ms: number; detail?: string };

export interface LocalSummaryOptions {
  fetch?: typeof fetch;
  model?: string;
  known: readonly KnownIdentifier[];
  template: DraftSummaryInput;
  timeoutMs?: number;
}

export function renderForLlm(turns: readonly Pick<Turn, "speaker" | "scrubbed">[]): string {
  return turns.map((t) => `${t.speaker === "donor" ? "DONOR" : "VOLUNTEER"}: ${t.scrubbed}`).join("\n");
}

function containsKnown(text: string, known: readonly KnownIdentifier[]): boolean {
  const lower = text.toLowerCase();
  return known.some((k) => lower.includes(k.value.toLowerCase()));
}

export async function summarizeLocally(turns: readonly Turn[], opts: LocalSummaryOptions): Promise<LocalSummaryResult> {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => window.fetch(...a));
  const started = performance.now();
  const fallback = (rejected: "unreachable" | "invalid" | "identifier", detail?: string): LocalSummaryResult => ({
    source: "template",
    summary: buildDraftSummary(opts.template),
    tags: [...opts.template.tags],
    rejected,
    latency_ms: Math.round(performance.now() - started),
    ...(detail ? { detail } : {}),
  });

  let content: string;
  try {
    const res = await doFetch(OLLAMA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: renderForLlm(turns) },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
    if (!res.ok) return fallback("unreachable", `HTTP ${res.status}`);
    const body = (await res.json()) as { message?: { content?: unknown } };
    content = typeof body.message?.content === "string" ? body.message.content : "";
  } catch (err) {
    return fallback("unreachable", err instanceof Error ? err.name : undefined);
  }

  let parsed: z.infer<typeof LlmOutput>;
  try {
    parsed = LlmOutput.parse(JSON.parse(content));
  } catch {
    return fallback("invalid");
  }
  if (hasIdentifiers(parsed.summary) || containsKnown(parsed.summary, opts.known)) return fallback("identifier");

  const tags: Tag[] = [];
  const dropped: string[] = [];
  for (const t of parsed.tags) {
    const ok = Tag.safeParse(t);
    if (ok.success) {
      if (!tags.includes(ok.data)) tags.push(ok.data);
    } else dropped.push(t.slice(0, 40));
  }
  return { source: "llm", summary: parsed.summary, tags: tags.sort(), dropped_tags: dropped, latency_ms: Math.round(performance.now() - started) };
}
