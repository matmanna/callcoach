/**
 * Rubric scoring from the structured call log. Pure: no I/O, no clock.
 *
 * A log holds outcome, reason, preference, follow-up, and flags. It never holds the words spoken,
 * so most rubric items about what the volunteer said are `unknown`. That is reported as
 * "not captured", not as a failure. Results are suggestions for a coordinator to review.
 */
import type { LogFields, RubricStatus } from "@sc/shared";

export interface RubricItemInput {
  id: string;
  text: string;
  supporting_tags: readonly string[];
  conditional_on_tag?: string | null | undefined;
  /** 0 to 5. Missing means 1. 0 switches the item off. */
  weight?: number | undefined;
}

export interface RubricResult {
  id: string;
  text: string;
  weight: number;
  status: RubricStatus;
  /** One short line for the UI, saying why. */
  basis: string;
}

export interface RubricScore {
  evaluated: number;
  /** Weighted share of evaluated items that were met, 0 to 100. Null when nothing was evaluated. */
  percent: number | null;
}

/** Tags a call can show, from the structured reason the donor gave. */
export function tagsForLog(fields: Pick<LogFields, "donor_stated_reason" | "preference">): Set<string> {
  const tags = new Set<string>();
  const reason = fields.donor_stated_reason;
  if (reason === "Shared a recent loss") tags.add("FAMILY_DECEASED_RECENT");
  if (reason === "Asked not to be called again" || fields.preference === "stop_calls") tags.add("STOP_CONTACT_REQUESTED");
  if (reason === "Prefers email contact" || fields.preference === "email_preferred") tags.add("EMAIL_PREFERRED");
  if (reason === "Asked for a call back later" || fields.preference === "call_later") tags.add("FOLLOW_UP_REQUESTED");
  if (reason === "Asked about the program") tags.add("PROGRAM_QUESTION");
  return tags;
}

const weightOf = (item: RubricItemInput) => (typeof item.weight === "number" ? item.weight : 1);

function evaluateItem(item: RubricItemInput, fields: LogFields, tags: Set<string>): { status: RubricStatus; basis: string } {
  if (item.conditional_on_tag && !tags.has(item.conditional_on_tag)) return { status: "n_a", basis: "Does not apply to this call" };
  // Every conversation can close with a next step, so that item is not gated by donor tags.
  const gated = item.id !== "next_step" && item.supporting_tags.length > 0;
  if (gated && !item.supporting_tags.some((t) => tags.has(t))) return { status: "n_a", basis: "Does not apply to this call" };

  switch (item.id) {
    case "next_step": {
      if (fields.outcome === "voicemail" || fields.outcome === "no_answer") return { status: "n_a", basis: "No conversation to close" };
      if (fields.follow_up.needed && fields.follow_up.action) return { status: "met", basis: "Next step logged" };
      if (fields.outcome === "rescheduled") return { status: "met", basis: "Call rescheduled" };
      return { status: "not_met", basis: "No next step logged" };
    }
    case "respected_limit": {
      if (tags.has("STOP_CONTACT_REQUESTED")) {
        return fields.follow_up.needed
          ? { status: "not_met", basis: "Follow-up logged after a stop request" }
          : { status: "met", basis: "No follow-up after a stop request" };
      }
      return { status: "unknown", basis: "Not captured in the log" };
    }
    case "acknowledged_loss":
      return { status: "unknown", basis: "Whether the loss was acknowledged is not in the log" };
    default:
      return { status: "unknown", basis: "Not captured in the log" };
  }
}

/** Results for every item, in rubric order. Items with weight 0 are still listed, marked n_a. */
export function evaluateRubric(items: readonly RubricItemInput[], fields: LogFields): RubricResult[] {
  const tags = tagsForLog(fields);
  return items.map((item) => {
    const weight = weightOf(item);
    if (weight === 0) return { id: item.id, text: item.text, weight, status: "n_a", basis: "Switched off" };
    return { id: item.id, text: item.text, weight, ...evaluateItem(item, fields, tags) };
  });
}

/** A percentage needs at least this many checked items. One item alone would read as a verdict on the whole call. */
export const MIN_EVALUATED_FOR_SCORE = 2;

/** Weighted share of met items among evaluated ones. `unknown` and `n_a` are left out, never counted as misses. */
export function rubricScore(results: readonly RubricResult[]): RubricScore {
  const evaluated = results.filter((r) => (r.status === "met" || r.status === "not_met") && r.weight > 0);
  const total = evaluated.reduce((s, r) => s + r.weight, 0);
  if (!total || evaluated.length < MIN_EVALUATED_FOR_SCORE) return { evaluated: evaluated.length, percent: null };
  const met = evaluated.filter((r) => r.status === "met").reduce((s, r) => s + r.weight, 0);
  return { evaluated: evaluated.length, percent: Math.round((met / total) * 100) };
}
