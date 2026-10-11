/**
 * LAB ONLY. Pure computations for the redaction lab: scrubbing per layer set, outbound
 * payloads, ledgers, planted-survivor counts, layer coverage, and the run-all matrix.
 * Raw text is read here but only ever leaves as scrubbed text or the template note.
 */
import {
  buildDraftSummary,
  buildKnownIdentifiers,
  collectTags,
  initialCueState,
  redactionCounts,
  redactWithExtra,
  scanForIdentifiers,
  selectCue,
  type ExtraInterval,
  type IdentifierCounts,
  type RedactContext,
} from "@sc/rules";
import type { LayerSelection } from "@sc/rules/lab";
import type { FlagLabel, PlaceholderType, Tag, Turn } from "@sc/shared";
import { cueRules, facts, phraseRules, type LabExcerpt } from "./data.ts";

export type Variant = "M" | "A" | "N";
export const VARIANTS: readonly Variant[] = ["M", "A", "N"];

/** NER intervals per turn id (raw offsets). Absent or empty means NER off. */
export type NerByTurn = ReadonlyMap<string, readonly ExtraInterval[]>;

export const LAYERS_M: LayerSelection = { known: true, regex: true, phrase: false };
export const LAYERS_A: LayerSelection = { known: true, regex: true, phrase: true };

export function ctxFor(x: LabExcerpt): RedactContext {
  return { known: buildKnownIdentifiers(x.donor, x.volunteer_name), phraseRules };
}

export function scrubExcerpt(x: LabExcerpt, layers: LayerSelection, ner?: NerByTurn): Turn[] {
  const ctx = ctxFor(x);
  return x.turns.map((t) => redactWithExtra(t, ctx, ner?.get(t.id) ?? [], layers));
}

export function renderTranscript(turns: readonly Pick<Turn, "speaker" | "scrubbed">[]): string {
  return turns.map((t) => `${t.speaker === "donor" ? "DONOR" : "VOLUNTEER"}: ${t.scrubbed}`).join("\n");
}

export interface Note {
  summary: string;
  tags: Tag[];
  counts: Record<PlaceholderType, number>;
  cueRuleIds: string[];
}

/** The real design's note: template summary + tags, derived from fully scrubbed turns. */
export function noteFromTurns(turns: readonly Turn[]): Note {
  let state = initialCueState();
  const matched = new Set<string>();
  const shown: string[] = [];
  for (const t of turns) {
    const r = selectCue(t, cueRules, facts, state);
    state = r.state;
    r.matchedRuleIds.forEach((id) => matched.add(id));
    if (r.cue) shown.push(r.cue.rule_id);
  }
  const tags = collectTags([...matched], turns, cueRules, phraseRules);
  const counts = redactionCounts(turns);
  return { summary: buildDraftSummary({ tags, counts, cueRuleIds: shown }), tags, counts, cueRuleIds: shown };
}

export type SendBody = { variant: "M" | "A"; text: string } | { variant: "N"; summary: string; tags: Tag[] };

export interface Outbound {
  body: SendBody;
  /** Exactly what the model would see (mirrors the server's outboundText). */
  modelText: string;
  /** JSON string actually sent. */
  json: string;
}

export function buildOutbound(x: LabExcerpt, variant: Variant, ner?: NerByTurn): Outbound {
  if (variant === "N") {
    const note = noteFromTurns(scrubExcerpt(x, LAYERS_A, ner));
    const body: SendBody = { variant: "N", summary: note.summary, tags: note.tags };
    return { body, modelText: `NOTE: ${note.summary}\nTAGS: ${note.tags.length ? note.tags.join(", ") : "(none)"}`, json: JSON.stringify(body) };
  }
  const text = renderTranscript(scrubExcerpt(x, variant === "M" ? LAYERS_M : LAYERS_A, ner));
  const body: SendBody = { variant, text };
  return { body, modelText: text, json: JSON.stringify(body) };
}

export interface Ledger {
  stayedChars: number;
  sentChars: number;
}

/** X = raw characters on this device (none of it is sent); Y = length of the JSON body sent. */
export function ledgerFor(x: LabExcerpt, out: Outbound): Ledger {
  return { stayedChars: x.turns.reduce((n, t) => n + t.raw.length, 0), sentChars: out.json.length };
}

export function survivingPlanted(x: LabExcerpt, outboundText: string): LabExcerpt["planted"] {
  const lower = outboundText.toLowerCase();
  return x.planted.filter((p) => lower.includes(p.value.toLowerCase()));
}

export function guardBlocks(c: IdentifierCounts): boolean {
  return c.phone + c.email + c.address + c.dob > 0;
}

export function localGuard(text: string): IdentifierCounts {
  return scanForIdentifiers(text);
}

// ---------- Layer coverage ----------

export type LayerKey = "known" | "regex" | "phrase" | "ner";
export const LAYER_KEYS: readonly LayerKey[] = ["known", "regex", "phrase", "ner"];

export interface CoverageRow {
  type: PlaceholderType;
  planted: number;
  caughtBy: Record<LayerKey, number>;
  /** Survivors (planted values still present in the scrubbed transcript) per combination label. */
  survivors: Record<string, number>;
}

export const COMBOS: ReadonlyArray<{ label: string; layers: LayerSelection; ner: boolean }> = [
  { label: "none", layers: { known: false, regex: false, phrase: false }, ner: false },
  { label: "K", layers: { known: true, regex: false, phrase: false }, ner: false },
  { label: "R", layers: { known: false, regex: true, phrase: false }, ner: false },
  { label: "P", layers: { known: false, regex: false, phrase: true }, ner: false },
  { label: "K+R (M)", layers: LAYERS_M, ner: false },
  { label: "K+R+P (A)", layers: LAYERS_A, ner: false },
  { label: "NER only", layers: { known: false, regex: false, phrase: false }, ner: true },
  { label: "K+R+P+NER", layers: LAYERS_A, ner: true },
];

function occurrences(text: string, value: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const t = text.toLowerCase();
  const v = value.toLowerCase();
  for (let i = t.indexOf(v); i >= 0; i = t.indexOf(v, i + 1)) out.push([i, i + v.length]);
  return out;
}

/** Interval sets per layer for one turn (raw offsets). */
export type TurnLayerIntervals = Record<LayerKey, ReadonlyArray<{ start: number; end: number }>>;

export function layerCoverage(
  items: ReadonlyArray<{ x: LabExcerpt; intervals: ReadonlyMap<string, TurnLayerIntervals>; ner?: NerByTurn }>,
): CoverageRow[] {
  const rows = new Map<PlaceholderType, CoverageRow>();
  const row = (type: PlaceholderType) => {
    let r = rows.get(type);
    if (!r) {
      r = { type, planted: 0, caughtBy: { known: 0, regex: 0, phrase: 0, ner: 0 }, survivors: Object.fromEntries(COMBOS.map((c) => [c.label, 0])) };
      rows.set(type, r);
    }
    return r;
  };
  for (const { x, intervals, ner } of items) {
    const comboText = new Map(COMBOS.map((c) => [c.label, renderTranscript(scrubExcerpt(x, c.layers, c.ner ? ner : undefined)).toLowerCase()]));
    for (const p of x.planted) {
      const r = row(p.type);
      r.planted += 1;
      for (const key of LAYER_KEYS) {
        // Caught by a layer if that layer's intervals overlap any raw occurrence of the value.
        const hit = x.turns.some((t) => {
          const ivs = intervals.get(t.id)?.[key] ?? [];
          return occurrences(t.raw, p.value).some(([s, e]) => ivs.some((iv) => iv.start < e && s < iv.end));
        });
        if (hit) r.caughtBy[key] += 1;
      }
      for (const c of COMBOS) if (comboText.get(c.label)!.includes(p.value.toLowerCase())) r.survivors[c.label]! += 1;
    }
  }
  return [...rows.values()];
}

// ---------- Matrix ----------

export interface SendResult {
  status: "ok" | "invalid" | "blocked" | "capped" | "error";
  flags: { label: FlagLabel; reason: string }[];
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

export interface FlagComparison {
  correct: FlagLabel[];
  missing: FlagLabel[];
  extra: FlagLabel[];
}

export function compareFlags(expected: readonly FlagLabel[], returned: readonly FlagLabel[]): FlagComparison {
  const ret = new Set(returned);
  const exp = new Set(expected);
  return {
    correct: [...exp].filter((l) => ret.has(l)),
    missing: [...exp].filter((l) => !ret.has(l)),
    extra: [...ret].filter((l) => !exp.has(l)),
  };
}

export interface MatrixRow {
  excerptId: string;
  variant: Variant;
  plantedTotal: number;
  survivorsNerOff: number;
  survivorsNerOn: number | null;
  guard: "blocked" | "passed";
  result: SendResult | null;
  expected: FlagLabel[];
  comparison: FlagComparison | null;
}

export interface VariantSummary {
  variant: Variant;
  survivorsNerOff: number;
  survivorsNerOn: number | null;
  plantedTotal: number;
  expectedTotal: number;
  found: number;
  extra: number;
  meanLatencyMs: number | null;
  totalTokens: number;
  sentChars: number;
  calls: number;
  mock: boolean;
}

export function summarize(rows: readonly MatrixRow[], sentChars: ReadonlyMap<Variant, number>): VariantSummary[] {
  return VARIANTS.map((v) => {
    const rs = rows.filter((r) => r.variant === v);
    const withResult = rs.filter((r) => r.result && r.result.status !== "capped" && r.result.status !== "blocked");
    const lat = withResult.map((r) => r.result!.latency_ms);
    return {
      variant: v,
      survivorsNerOff: rs.reduce((n, r) => n + r.survivorsNerOff, 0),
      survivorsNerOn: rs.every((r) => r.survivorsNerOn !== null) && rs.length ? rs.reduce((n, r) => n + (r.survivorsNerOn ?? 0), 0) : null,
      plantedTotal: rs.reduce((n, r) => n + r.plantedTotal, 0),
      expectedTotal: rs.reduce((n, r) => n + r.expected.length, 0),
      found: rs.reduce((n, r) => n + (r.comparison?.correct.length ?? 0), 0),
      extra: rs.reduce((n, r) => n + (r.comparison?.extra.length ?? 0), 0),
      meanLatencyMs: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
      totalTokens: withResult.reduce((n, r) => n + r.result!.input_tokens + r.result!.output_tokens, 0),
      sentChars: sentChars.get(v) ?? 0,
      calls: withResult.length,
      mock: rs.some((r) => r.result?.mock),
    };
  });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with labels and counts only; no call text. */
export function matrixCsv(rows: readonly MatrixRow[]): string {
  const header = [
    "excerpt",
    "variant",
    "planted_total",
    "survivors_ner_off",
    "survivors_ner_on",
    "guard",
    "status",
    "mock",
    "flags_returned",
    "expected_flags",
    "correct",
    "missing",
    "extra",
    "latency_ms",
    "input_tokens",
    "output_tokens",
    "payload_chars",
  ];
  const lines = rows.map((r) =>
    [
      r.excerptId,
      r.variant,
      r.plantedTotal,
      r.survivorsNerOff,
      r.survivorsNerOn ?? "",
      r.guard,
      r.result?.status ?? "",
      r.result?.mock ? "MOCK" : "",
      (r.result?.flags ?? []).map((f) => f.label).join(" "),
      r.expected.join(" "),
      r.comparison?.correct.join(" ") ?? "",
      r.comparison?.missing.join(" ") ?? "",
      r.comparison?.extra.join(" ") ?? "",
      r.result?.latency_ms ?? "",
      r.result?.input_tokens ?? "",
      r.result?.output_tokens ?? "",
      r.result?.payload_chars ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

/** Run tasks with bounded concurrency, preserving order. */
export async function runPool<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
}
