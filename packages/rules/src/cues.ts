import type { CueRule, CueType, Fact, Tag, Turn } from "@sc/shared";
import { WORD_END, WORD_START, escapeRegex } from "./patterns.ts";

export interface CueState {
  readonly lastFiredMs: Readonly<Record<string, number>>;
  readonly shownFactIds: readonly string[];
}

export function initialCueState(): CueState {
  return { lastFiredMs: {}, shownFactIds: [] };
}

export interface Cue {
  rule_id: string;
  type: CueType;
  tag?: Tag;
  card_text: string;
  source?: string;
  verified_on?: string;
}

export interface CueSelection {
  cue: Cue | null;
  /** True when the chosen cue is a stop-contact cue. The coordinator decides; nothing is written. */
  dncCandidate: boolean;
  state: CueState;
  /**
   * Every eligible rule whose trigger matched this turn, in rules-file order, including the
   * chosen one. Lets callers collect tags for matches that lost on priority.
   */
  matchedRuleIds: string[];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'");
}

function triggerMatches(text: string, trigger: string): boolean {
  return new RegExp(`${WORD_START}${escapeRegex(trigger)}${WORD_END}`, "u").test(text);
}

function copyState(state: CueState): CueState {
  return { lastFiredMs: { ...state.lastFiredMs }, shownFactIds: [...state.shownFactIds] };
}

/**
 * Pick at most one cue for a turn. Donor turns only. Matches against the scrubbed text.
 * Skips disabled rules, rules in cooldown (by `turn.t`), and fact rules whose fact was
 * already shown this call. Lowest priority number wins; ties go to rules-file order.
 * Never mutates `state`.
 */
export function selectCue(turn: Turn, rules: readonly CueRule[], facts: readonly Fact[], state: CueState): CueSelection {
  if (turn.speaker !== "donor") return { cue: null, dncCandidate: false, state: copyState(state), matchedRuleIds: [] };

  const text = normalize(turn.scrubbed);
  const matched = rules.filter((rule) => {
    if (!rule.enabled) return false;
    const last = state.lastFiredMs[rule.id];
    if (last !== undefined && turn.t - last < rule.cooldown_s * 1000) return false;
    if (rule.type === "fact" && rule.fact_id && state.shownFactIds.includes(rule.fact_id)) return false;
    return rule.triggers.some((trigger) => triggerMatches(text, trigger));
  });

  // Array.prototype.reduce keeps the first of equal elements, so file order breaks ties.
  const chosen = matched.reduce<CueRule | null>((best, r) => (best === null || r.priority < best.priority ? r : best), null);
  const matchedRuleIds = matched.map((r) => r.id);
  if (!chosen) return { cue: null, dncCandidate: false, state: copyState(state), matchedRuleIds };

  const cue: Cue = { rule_id: chosen.id, type: chosen.type, card_text: "" };
  if (chosen.tag) cue.tag = chosen.tag;
  let shownFactIds = [...state.shownFactIds];
  if (chosen.type === "fact") {
    const fact = facts.find((f) => f.id === chosen.fact_id);
    if (!fact) throw new Error(`cue rule ${chosen.id} references missing fact ${String(chosen.fact_id)}`);
    cue.card_text = fact.text;
    cue.source = fact.source;
    cue.verified_on = fact.verified_on;
    shownFactIds = [...shownFactIds, fact.id];
  } else {
    if (!chosen.card_text) throw new Error(`cue rule ${chosen.id} has no card_text`);
    cue.card_text = chosen.card_text;
  }

  return {
    cue,
    dncCandidate: chosen.type === "stop_contact",
    state: { lastFiredMs: { ...state.lastFiredMs, [chosen.id]: turn.t }, shownFactIds },
    matchedRuleIds,
  };
}

/** Throws on a missing fact_id, a non-lowercase trigger, or a duplicate rule id. */
export function validateRules(rules: readonly CueRule[], facts: readonly Fact[]): void {
  const factIds = new Set(facts.map((f) => f.id));
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) throw new Error(`duplicate cue rule id: ${rule.id}`);
    seen.add(rule.id);
    if (rule.fact_id !== undefined && !factIds.has(rule.fact_id))
      throw new Error(`cue rule ${rule.id} references missing fact ${rule.fact_id}`);
    for (const trigger of rule.triggers)
      if (trigger !== trigger.toLowerCase()) throw new Error(`cue rule ${rule.id} has a non-lowercase trigger`);
  }
}
