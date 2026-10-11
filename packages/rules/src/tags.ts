import type { CueRule, PhraseRule, RedactionSpan, Tag } from "@sc/shared";

/** A scrubbed turn's text plus its spans. Only placeholder text is ever read from `scrubbed`. */
export interface ScrubbedSpans {
  readonly scrubbed: string;
  readonly redactions: readonly RedactionSpan[];
}

/**
 * Unique, sorted tags from fired cue rules and matched phrase rules. A phrase rule counts as
 * matched when a FAMILY span in a scrubbed turn holds that rule's placeholder.
 */
export function collectTags(
  firedRuleIds: readonly string[],
  spans: readonly ScrubbedSpans[],
  cueRules: readonly CueRule[],
  phraseRules: readonly PhraseRule[],
): Tag[] {
  const tags = new Set<Tag>();
  const fired = new Set(firedRuleIds);
  for (const rule of cueRules) if (rule.tag && fired.has(rule.id)) tags.add(rule.tag);

  for (const turn of spans) {
    for (const span of turn.redactions) {
      if (span.type !== "FAMILY") continue;
      const placeholder = turn.scrubbed.slice(span.start, span.end);
      for (const rule of phraseRules) if (rule.tag && rule.placeholder === placeholder) tags.add(rule.tag);
    }
  }
  return [...tags].sort();
}
