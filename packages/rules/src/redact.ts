import type { Donor, PhraseRule, PlaceholderType, RawTurn, RedactionSpan, Turn } from "@sc/shared";
import { PlaceholderType as PlaceholderTypeEnum } from "@sc/shared";
import { PLACEHOLDER_SOURCE, WORD_END, WORD_START, escapeRegex, findIdentifierMatches } from "./patterns.ts";

export type KnownIdentifierType = Extract<PlaceholderType, "NAME" | "EMPLOYER" | "TOWN">;

export interface KnownIdentifier {
  readonly value: string;
  readonly type: KnownIdentifierType;
}

export interface RedactContext {
  readonly known: readonly KnownIdentifier[];
  readonly phraseRules: readonly PhraseRule[];
}

const MIN_KNOWN_LENGTH = 3;

/**
 * Identifiers the redactor knows about for this call: donor first, last, and full name,
 * spouse name, employer, town, and the volunteer's name. Multi-word person names also
 * contribute each part. Values shorter than 3 characters are skipped.
 */
export function buildKnownIdentifiers(donor: Donor, volunteerName: string): KnownIdentifier[] {
  const candidates: KnownIdentifier[] = [];
  const addName = (full: string | undefined, splitParts: boolean) => {
    if (!full) return;
    candidates.push({ value: full, type: "NAME" });
    if (splitParts) for (const part of full.split(/\s+/)) candidates.push({ value: part, type: "NAME" });
  };
  addName(donor.first_name, false);
  addName(donor.last_name, false);
  addName(`${donor.first_name} ${donor.last_name}`, false);
  addName(donor.spouse_name, true);
  if (donor.employer) candidates.push({ value: donor.employer, type: "EMPLOYER" });
  if (donor.town) candidates.push({ value: donor.town, type: "TOWN" });
  addName(volunteerName, true);

  const seen = new Set<string>();
  const out: KnownIdentifier[] = [];
  for (const c of candidates) {
    const value = c.value.trim();
    const key = value.toLowerCase();
    if (value.length < MIN_KNOWN_LENGTH || seen.has(key)) continue;
    seen.add(key);
    out.push({ value, type: c.type });
  }
  return out;
}

/** Layer index doubles as the tie-break: lower layer wins on equal length. */
const Layer = { Existing: -1, Known: 0, Regex: 1, Phrase: 2 } as const;
type Layer = (typeof Layer)[keyof typeof Layer];

interface Interval {
  start: number;
  end: number;
  type: PlaceholderType;
  placeholder: string;
  layer: Layer;
}

function placeholderFor(type: PlaceholderType): string {
  return `[${type}]`;
}

/** Placeholders already in the text. They are kept verbatim and never re-matched. */
function existingPlaceholders(text: string): Interval[] {
  const out: Interval[] = [];
  for (const m of text.matchAll(new RegExp(PLACEHOLDER_SOURCE, "g"))) {
    const type = PlaceholderTypeEnum.parse(m[1]);
    out.push({ start: m.index, end: m.index + m[0].length, type, placeholder: m[0], layer: Layer.Existing });
  }
  return out;
}

function knownMatches(text: string, known: readonly KnownIdentifier[]): Interval[] {
  const out: Interval[] = [];
  for (const k of known) {
    const re = new RegExp(`${WORD_START}${escapeRegex(k.value)}(?:['’]s)?${WORD_END}`, "giu");
    for (const m of text.matchAll(re)) {
      out.push({ start: m.index, end: m.index + m[0].length, type: k.type, placeholder: placeholderFor(k.type), layer: Layer.Known });
    }
  }
  return out;
}

function regexMatches(text: string): Interval[] {
  return findIdentifierMatches(text).map((m) => ({ ...m, placeholder: placeholderFor(m.type), layer: Layer.Regex }));
}

function phraseMatches(text: string, rules: readonly PhraseRule[]): Interval[] {
  const out: Interval[] = [];
  for (const rule of rules) {
    for (const source of rule.patterns) {
      for (const m of text.matchAll(new RegExp(source, "gi"))) {
        if (m[0].length === 0) continue;
        out.push({ start: m.index, end: m.index + m[0].length, type: rule.type, placeholder: rule.placeholder, layer: Layer.Phrase });
      }
    }
  }
  return out;
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/** a beats b: longer wins; on equal length the earlier layer wins; then the earlier start. */
function beats(a: Interval, b: Interval): boolean {
  const la = a.end - a.start;
  const lb = b.end - b.start;
  if (la !== lb) return la > lb;
  if (a.layer !== b.layer) return a.layer < b.layer;
  return a.start < b.start;
}

/**
 * Merge overlapping intervals into one interval covering their union, so no fragment of
 * any matched identifier survives. The merged interval takes the type and placeholder of
 * its winning member (longest; ties go to the earlier layer). Candidates that overlap a
 * placeholder already in the text are dropped, so placeholders are never re-matched.
 */
function mergeIntervals(existing: Interval[], candidates: Interval[]): Interval[] {
  const free = candidates.filter((c) => !existing.some((e) => overlaps(e, c)));
  free.sort((a, b) => a.start - b.start || b.end - a.end);
  const clusters: Interval[][] = [];
  let clusterEnd = -1;
  for (const c of free) {
    const current = clusters[clusters.length - 1];
    if (current && c.start < clusterEnd) {
      current.push(c);
      clusterEnd = Math.max(clusterEnd, c.end);
    } else {
      clusters.push([c]);
      clusterEnd = c.end;
    }
  }
  const merged = clusters.map((members) => {
    const winner = members.reduce((best, m) => (beats(m, best) ? m : best));
    const start = Math.min(...members.map((m) => m.start));
    const end = Math.max(...members.map((m) => m.end));
    return { ...winner, start, end };
  });
  return [...merged, ...existing].sort((a, b) => a.start - b.start);
}

/**
 * Scrub one raw turn. All three layers (known identifiers, identifier regexes, phrase rules)
 * match against the original raw text; overlaps are merged; the scrubbed string is then built
 * in a single pass with span offsets computed against the output.
 */
export function redactTurn(raw: RawTurn, ctx: RedactContext): Turn {
  const text = raw.raw;
  const existing = existingPlaceholders(text);
  const candidates = [...knownMatches(text, ctx.known), ...regexMatches(text), ...phraseMatches(text, ctx.phraseRules)];
  const intervals = mergeIntervals(existing, candidates);

  let scrubbed = "";
  let cursor = 0;
  const redactions: RedactionSpan[] = [];
  for (const iv of intervals) {
    scrubbed += text.slice(cursor, iv.start);
    const start = scrubbed.length;
    scrubbed += iv.placeholder;
    redactions.push({ type: iv.type, start, end: scrubbed.length });
    cursor = iv.end;
  }
  scrubbed += text.slice(cursor);

  return { id: raw.id, speaker: raw.speaker, scrubbed, redactions, t: raw.t };
}

/** Count of redactions per placeholder type across turns. Every type is present. */
export function redactionCounts(turns: readonly Pick<Turn, "redactions">[]): Record<PlaceholderType, number> {
  const counts = Object.fromEntries(PlaceholderTypeEnum.options.map((t) => [t, 0])) as Record<PlaceholderType, number>;
  for (const turn of turns) for (const span of turn.redactions) counts[span.type] += 1;
  return counts;
}
