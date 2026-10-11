import type { Donor, PhraseRule, PlaceholderType } from "@sc/shared";
import { buildKnownIdentifiers, redactTurn, type RedactContext } from "./redact.ts";

export function noteContext(donor: Donor, callerName: string, phraseRules: readonly PhraseRule[]): RedactContext {
  return { known: buildKnownIdentifiers(donor, callerName), phraseRules };
}

/** A short typed note is scrubbed with the same three layers as a browser turn. */
export function scrubNote(note: string, ctx: RedactContext): { text: string; counts: Partial<Record<PlaceholderType, number>> } {
  const turn = redactTurn({ id: "note", speaker: "volunteer", raw: note, t: 0 }, ctx);
  const counts: Partial<Record<PlaceholderType, number>> = {};
  for (const span of turn.redactions) counts[span.type] = (counts[span.type] ?? 0) + 1;
  return { text: turn.scrubbed, counts };
}
