/**
 * LAB ONLY. Explains which redaction layer matched what, with offsets into the RAW text.
 * Raw-text positions must never leave the browser: do not import this module from apps/api.
 * Reachable only via the "@sc/rules/lab" subpath, not the package index.
 */
import type { PlaceholderType, RawTurn, RedactionSpan, Turn } from "@sc/shared";
import {
  ALL_LAYERS,
  applyRedactionPlan,
  planRedaction,
  type ExtraInterval,
  type Interval as InternalInterval,
  type LayerSelection,
  type RedactContext,
} from "./redact.ts";

export type { LayerSelection } from "./redact.ts";
export { ALL_LAYERS } from "./redact.ts";

export type LayerName = "existing" | "known" | "regex" | "phrase" | "extra";

export interface Interval {
  start: number;
  end: number;
  type: PlaceholderType;
  layer: LayerName;
}

export interface RedactionExplanation {
  scrubbed: string;
  layers: { known: Interval[]; regex: Interval[]; phrase: Interval[] };
  merged: Interval[];
  redactions: RedactionSpan[];
}

const LAYER_NAMES: Record<number, LayerName> = { [-1]: "existing", 0: "known", 1: "regex", 2: "phrase", 3: "extra" };

function toPublic(iv: InternalInterval): Interval {
  return { start: iv.start, end: iv.end, type: iv.type, layer: LAYER_NAMES[iv.layer] ?? "existing" };
}

/**
 * Same code path as `redactTurn`, plus each layer's raw intervals and the merged result.
 * `enabled` defaults to all layers, which makes `scrubbed` identical to `redactTurn`.
 */
export function explainRedaction(
  raw: RawTurn,
  ctx: RedactContext,
  enabled: LayerSelection = ALL_LAYERS,
  extra: readonly ExtraInterval[] = [],
): RedactionExplanation {
  const plan = planRedaction(raw.raw, ctx, enabled, extra);
  const turn = applyRedactionPlan(raw, plan);
  return {
    scrubbed: turn.scrubbed,
    layers: { known: plan.known.map(toPublic), regex: plan.regex.map(toPublic), phrase: plan.phrase.map(toPublic) },
    merged: plan.merged.map(toPublic),
    redactions: turn.redactions,
  };
}

/** Scrub with a subset of layers. Condition M = known + regex; condition A = all three. */
export function redactWithLayers(raw: RawTurn, ctx: RedactContext, enabled: LayerSelection): Turn {
  return applyRedactionPlan(raw, planRedaction(raw.raw, ctx, enabled));
}
