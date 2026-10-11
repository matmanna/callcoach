/**
 * The one source of identifier regexes. redact.ts and guard.ts both import from here
 * so the redactor and the server-side PII guard cannot drift.
 *
 * Patterns are stored as source + flags and compiled per call, so no shared `lastIndex`
 * state leaks between callers.
 */
import type { PlaceholderType } from "@sc/shared";

export type RegexIdentifierType = Extract<PlaceholderType, "PHONE" | "EMAIL" | "ADDRESS" | "DOB">;

interface PatternDef {
  readonly type: RegexIdentifierType;
  readonly source: string;
  readonly flags: string;
}

const STREET_SUFFIX = "(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Ct|Way)";
const STREET_WORD = "[A-Za-z][A-Za-z'.-]*";
const MONTH =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const YEAR = "(?:19|20)\\d{2}";
const DAY = "\\d{1,2}(?:st|nd|rd|th)?";

export const IDENTIFIER_PATTERNS: readonly PatternDef[] = [
  {
    type: "EMAIL",
    source: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
    flags: "g",
  },
  {
    // (814) 555-0142, 814-555-0142, 814.555.0142, 814 555 0142, optional +1, or a bare 10-digit run.
    type: "PHONE",
    source: "(?<![\\w])(?:\\+?1[\\s.-]?)?(?:\\(\\d{3}\\)\\s?|\\d{3}[\\s.-])\\d{3}[\\s.-]\\d{4}(?!\\d)|(?<!\\d)\\d{10}(?!\\d)",
    flags: "g",
  },
  {
    // House number, one to four words, then a capitalized street suffix. Case-sensitive on the
    // suffix so ordinary words like "drive" or "way" in speech do not trigger it.
    type: "ADDRESS",
    source: `(?<![\\w])\\d{1,6}\\s+(?:${STREET_WORD}\\s+){1,4}${STREET_SUFFIX}\\b`,
    flags: "g",
  },
  {
    // Numeric MM/DD/YYYY (or dashes), and month-name forms that carry a year:
    // "March 3, 1950", "Mar 1950", "3 March 1950", "3rd of March, 1950".
    type: "DOB",
    source: [
      `(?<!\\d)(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\\d|3[01])[/-]${YEAR}(?!\\d)`,
      `\\b${MONTH}\\.?\\s+(?:${DAY},?\\s+)?${YEAR}\\b`,
      `\\b${DAY}\\s+(?:of\\s+)?${MONTH}\\.?,?\\s+${YEAR}\\b`,
    ].join("|"),
    flags: "gi",
  },
];

export interface PatternMatch {
  readonly type: RegexIdentifierType;
  readonly start: number;
  readonly end: number;
}

/** All regex-layer matches in `text`, as offsets only. */
export function findIdentifierMatches(text: string): PatternMatch[] {
  const out: PatternMatch[] = [];
  for (const p of IDENTIFIER_PATTERNS) {
    for (const m of text.matchAll(new RegExp(p.source, p.flags))) {
      if (m[0].length > 0) out.push({ type: p.type, start: m.index, end: m.index + m[0].length });
    }
  }
  return out;
}

/** Matches any placeholder the redactor emits, e.g. `[NAME]` or `[FAMILY: deceased, recent]`. */
export const PLACEHOLDER_SOURCE = "\\[(NAME|PHONE|EMAIL|ADDRESS|DOB|EMPLOYER|TOWN|FAMILY)(?::[^\\[\\]]*)?\\]";

/** Escape a literal for use inside a RegExp. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Letter/digit-aware word boundaries (works for non-ASCII names, unlike `\b`). */
export const WORD_START = "(?<![\\p{L}\\p{N}_])";
export const WORD_END = "(?![\\p{L}\\p{N}_])";
