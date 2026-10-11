/**
 * Async redaction: layers 1-3 (sync, packages/rules) plus on-device NER as layer 4.
 * Fails closed: if NER is on and fails, the turn is HELD and must not be sent, unless the
 * volunteer chose "continue without NER" for this call (which the UI shows as a badge).
 */
import { redactWithExtra, type RedactContext } from "@sc/rules";
import type { RawTurn, Turn } from "@sc/shared";
import { mapEntities, type MapOptions } from "./nerMapping.ts";
import type { NerEntity, NerInterval } from "./nerTypes.ts";

export interface AsyncRedactContext extends RedactContext {
  ner: {
    enabled: boolean;
    run: (text: string) => Promise<NerEntity[]>;
    options?: MapOptions;
  };
  /** Set by the "continue without NER for this call" button. */
  continueWithoutNer?: boolean;
}

export interface NerStats {
  entities_found: number;
  entities_used: number;
  entities_allowlisted: number;
}

export type AsyncRedactResult =
  | {
      status: "ready";
      turn: Turn;
      timings: { sync_ms: number; ner_ms: number };
      ner: NerStats;
      /** NER intervals that went into the merge. Raw offsets: stays in the browser. */
      nerIntervals: NerInterval[];
      /** True when NER failed and the volunteer chose to continue without it. */
      nerSkipped: boolean;
    }
  | { status: "held"; reason: "ner_unavailable"; timings: { sync_ms: number; ner_ms: number } };

const now = () => performance.now();

export async function redactTurnAsync(raw: RawTurn, ctx: AsyncRedactContext): Promise<AsyncRedactResult> {
  const t0 = now();
  const syncOnly = redactWithExtra(raw, ctx, []);
  const sync_ms = now() - t0;
  const empty: NerStats = { entities_found: 0, entities_used: 0, entities_allowlisted: 0 };

  if (!ctx.ner.enabled) return { status: "ready", turn: syncOnly, timings: { sync_ms, ner_ms: 0 }, ner: empty, nerIntervals: [], nerSkipped: false };

  const t1 = now();
  let entities: NerEntity[];
  try {
    entities = await ctx.ner.run(raw.raw);
  } catch {
    const ner_ms = now() - t1;
    if (ctx.continueWithoutNer) return { status: "ready", turn: syncOnly, timings: { sync_ms, ner_ms }, ner: empty, nerIntervals: [], nerSkipped: true };
    return { status: "held", reason: "ner_unavailable", timings: { sync_ms, ner_ms } };
  }
  const ner_ms = now() - t1;
  const mapped = mapEntities(raw.raw, entities, ctx.ner.options);
  const turn = redactWithExtra(raw, ctx, mapped.used);
  return {
    status: "ready",
    turn,
    timings: { sync_ms, ner_ms },
    ner: { entities_found: entities.length, entities_used: mapped.used.length, entities_allowlisted: mapped.allowlisted.length },
    nerIntervals: mapped.used,
    nerSkipped: false,
  };
}
