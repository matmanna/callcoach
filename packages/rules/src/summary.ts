import { Tag } from "@sc/shared";
import type { PlaceholderType } from "@sc/shared";
import type { RedactionCounts } from "@sc/shared";

/** One fixed sentence per tag. Templates only: never interpolate call text. */
export const TAG_SENTENCES: Readonly<Record<Tag, string>> = {
  FAMILY_DECEASED_RECENT: "Donor mentioned a recent family loss.",
  HARDSHIP: "Donor mentioned a personal hardship.",
  PROGRAM_QUESTION: "Donor asked about the program.",
  EMAIL_PREFERRED: "Donor prefers email contact.",
  STOP_CONTACT_REQUESTED: "Donor asked not to be contacted this way again.",
  FOLLOW_UP_REQUESTED: "Donor asked for a follow-up.",
  BEQUEST_MENTION: "Donor mentioned a bequest.",
  MONTHLY_GIVING_INTEREST: "Donor showed interest in monthly giving.",
};

const CONTACT_TYPES: readonly PlaceholderType[] = ["PHONE", "EMAIL", "ADDRESS"];
const OTHER_TYPES: readonly PlaceholderType[] = ["NAME", "EMPLOYER", "TOWN", "DOB", "FAMILY"];

const NOUNS: Readonly<Record<PlaceholderType, [singular: string, plural: string]>> = {
  NAME: ["name", "names"],
  PHONE: ["phone number", "phone numbers"],
  EMAIL: ["email address", "email addresses"],
  ADDRESS: ["street address", "street addresses"],
  DOB: ["date of birth", "dates of birth"],
  EMPLOYER: ["employer", "employers"],
  TOWN: ["town", "towns"],
  FAMILY: ["family detail", "family details"],
};

export const SUMMARY_MAX_CHARS = 400;
export const NEUTRAL_SUMMARY = "Thank-you call completed. No topics were recorded.";

export interface DraftSummaryInput {
  tags: readonly Tag[];
  counts: RedactionCounts;
  cueRuleIds: readonly string[];
}

function countPhrase(types: readonly PlaceholderType[], counts: RedactionCounts): string | null {
  const parts = types.flatMap((t) => {
    const n = counts[t] ?? 0;
    if (n <= 0) return [];
    const [one, many] = NOUNS[t];
    return [`${n} ${n === 1 ? one : many}`];
  });
  return parts.length ? parts.join(", ") : null;
}

/**
 * Deterministic, template-only draft summary, at most 400 characters. Built from tag
 * sentences, removed-identifier counts by category, and the number of cue cards shown.
 * Contains no call text, names, or placeholder strings.
 */
export function buildDraftSummary({ tags, counts, cueRuleIds }: DraftSummaryInput): string {
  const tagSet = new Set(tags.filter((t) => Tag.safeParse(t).success));
  // Enum order, not input order, so equal inputs always give equal output.
  const sentences = Tag.options.filter((t) => tagSet.has(t)).map((t) => TAG_SENTENCES[t]);

  const contact = countPhrase(CONTACT_TYPES, counts);
  if (contact) sentences.push(`Contact details were removed: ${contact}.`);
  const other = countPhrase(OTHER_TYPES, counts);
  if (other) sentences.push(`Other identifiers were removed: ${other}.`);

  const cueCount = new Set(cueRuleIds).size;
  if (cueCount > 0) sentences.push(`${cueCount} cue ${cueCount === 1 ? "card was" : "cards were"} shown during the call.`);

  if (tagSet.has("STOP_CONTACT_REQUESTED")) sentences.push("Next step: coordinator to review the contact request before any outreach.");
  else if (tagSet.has("EMAIL_PREFERRED")) sentences.push("Next step: follow up by email, not phone.");

  if (sentences.length === 0) return NEUTRAL_SUMMARY;

  // Drop whole sentences from the end (keeping the closing line) until under the cap.
  let out = sentences.join(" ");
  while (out.length > SUMMARY_MAX_CHARS && sentences.length > 1) {
    sentences.splice(sentences.length - 2, 1);
    out = sentences.join(" ");
  }
  return out.slice(0, SUMMARY_MAX_CHARS);
}

