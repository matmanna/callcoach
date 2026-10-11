/**
 * Merge externally detected intervals (layer 4, for example on-device NER) into the
 * redaction. Pure: the caller runs any model and passes plain offsets into the raw text.
 */
import type { RawTurn, Turn } from "@sc/shared";
import { ALL_LAYERS, applyRedactionPlan, planRedaction, type ExtraInterval, type LayerSelection, type RedactContext } from "./redact.ts";

export type { ExtraInterval } from "./redact.ts";

/**
 * Runs layers 1-3, merges `extra` with the same overlap rule (longest wins; on a tie the
 * earlier layer wins, and `extra` is layer 4), then builds the scrubbed string in one pass.
 * With `extra = []` the result equals `redactTurn`.
 */
export function redactWithExtra(
  raw: RawTurn,
  ctx: RedactContext,
  extra: readonly ExtraInterval[],
  layers: LayerSelection = ALL_LAYERS,
): Turn {
  return applyRedactionPlan(raw, planRedaction(raw.raw, ctx, layers, extra));
}
