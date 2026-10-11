/**
 * Deterministic post-call draft from a SCRUBBED note. Pure: no I/O, no clock.
 * Trigger phrases are data (data/log-rules.json and data/cue-rules.json), not code.
 */
import type { CueRule, LogFields, LogFlag, LogRulesFile, Preference } from "@sc/shared";
import { WORD_END, WORD_START, escapeRegex } from "./patterns.ts";

function norm(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'");
}

function hit(text: string, triggers: readonly string[]): boolean {
  return triggers.some((t) => new RegExp(`${WORD_START}${escapeRegex(t)}${WORD_END}`, "u").test(text));
}

const PREFERENCE_ORDER: readonly Exclude<Preference, "none">[] = ["stop_calls", "email_preferred", "call_later"];

export function draftFromNote(scrubbedNote: string, rules: { logRules: LogRulesFile; cueRules: readonly CueRule[] }): LogFields {
  const text = norm(scrubbedNote);
  const outcome = rules.logRules.outcome.find((r) => hit(text, r.triggers))?.outcome ?? "reached";

  let preference: Preference = "none";
  for (const p of PREFERENCE_ORDER) {
    const rule = rules.logRules.preference.find((r) => r.preference === p);
    if (rule && hit(text, rule.triggers)) {
      preference = p;
      break;
    }
  }

  const cueHit = (type: CueRule["type"]) => rules.cueRules.some((r) => r.enabled && r.type === type && hit(text, r.triggers));
  const flags: LogFlag[] = [];
  if (cueHit("distress")) flags.push("DISTRESS");
  if (preference === "stop_calls" || cueHit("stop_contact")) flags.push("STOP_CONTACT");
  for (const rule of rules.logRules.flag ?? []) if (hit(text, rule.triggers) && !flags.includes(rule.label)) flags.push(rule.label);
  if (flags.includes("STOP_CONTACT") && preference === "none") preference = "stop_calls";

  const reason =
    preference === "stop_calls"
      ? "Asked not to be called again"
      : preference === "email_preferred"
        ? "Prefers email contact"
        : preference === "call_later"
          ? "Asked for a call back later"
          : outcome === "declined"
            ? "Declined to talk"
            : outcome === "voicemail"
              ? "Left a voicemail"
              : outcome === "no_answer"
                ? "No answer"
                : flags.includes("DISTRESS")
                  ? "Shared a recent loss"
                  : cueHit("fact")
                    ? "Asked about the program"
                    : "Thanked for the gift";

  const fu = preference === "stop_calls" ? undefined : rules.logRules.follow_up.find((r) => hit(text, r.triggers));
  return {
    outcome,
    donor_stated_reason: reason,
    preference,
    follow_up: { needed: !!fu, action: fu?.action ?? "", due_date: null },
    flags,
  };
}
