import type { LogFields } from "@sc/shared";
import { describe, expect, it } from "vitest";
import { evaluateRubric, rubricScore, tagsForLog, type RubricItemInput } from "../src/rubricEval.ts";

const items: RubricItemInput[] = [
  { id: "thanked_by_name", text: "Thanked the donor by name", supporting_tags: [] },
  { id: "open_question", text: "Asked one open question", supporting_tags: ["PROGRAM_QUESTION"] },
  { id: "acknowledged_loss", text: "Acknowledged a loss", supporting_tags: ["FAMILY_DECEASED_RECENT"], conditional_on_tag: "FAMILY_DECEASED_RECENT" },
  { id: "respected_limit", text: "Respected a stated limit", supporting_tags: ["STOP_CONTACT_REQUESTED", "EMAIL_PREFERRED"] },
  { id: "no_ask", text: "Made no ask in this call", supporting_tags: [] },
  { id: "next_step", text: "Closed with a next step", supporting_tags: ["FOLLOW_UP_REQUESTED", "EMAIL_PREFERRED"] },
];

const base: LogFields = {
  outcome: "reached",
  donor_stated_reason: "Thanked for the gift",
  preference: "none",
  follow_up: { needed: false, action: "", due_date: null },
  flags: [],
};
const status = (results: ReturnType<typeof evaluateRubric>, id: string) => results.find((r) => r.id === id)!.status;

describe("rubric evaluation from the call log", () => {
  it("marks items about spoken words as not captured, never as misses", () => {
    const r = evaluateRubric(items, base);
    expect(status(r, "thanked_by_name")).toBe("unknown");
    expect(status(r, "no_ask")).toBe("unknown");
  });

  it("marks items whose moment never happened as not applicable", () => {
    const r = evaluateRubric(items, base);
    expect(status(r, "acknowledged_loss")).toBe("n_a");
    expect(status(r, "open_question")).toBe("n_a");
    expect(status(r, "respected_limit")).toBe("n_a");
  });

  it("judges the next step from the logged follow-up", () => {
    expect(status(evaluateRubric(items, { ...base, follow_up: { needed: true, action: "Send summary", due_date: null } }), "next_step")).toBe("met");
    expect(status(evaluateRubric(items, base), "next_step")).toBe("not_met");
    expect(status(evaluateRubric(items, { ...base, outcome: "voicemail" }), "next_step")).toBe("n_a");
  });

  it("checks a stop request against any follow-up that was booked", () => {
    const stop = { ...base, donor_stated_reason: "Asked not to be called again" as const, preference: "stop_calls" as const };
    expect(status(evaluateRubric(items, stop), "respected_limit")).toBe("met");
    expect(status(evaluateRubric(items, { ...stop, follow_up: { needed: true, action: "Call again", due_date: null } }), "respected_limit")).toBe("not_met");
  });

  it("applies a loss only when the donor shared one", () => {
    const loss = { ...base, donor_stated_reason: "Shared a recent loss" as const };
    expect(status(evaluateRubric(items, loss), "acknowledged_loss")).toBe("unknown");
    expect(tagsForLog(loss).has("FAMILY_DECEASED_RECENT")).toBe(true);
  });

  it("scores once two or more weighted items can be checked", () => {
    const pair = [
      { id: "next_step", text: "x", supporting_tags: [], weight: 3 },
      { id: "respected_limit", text: "y", supporting_tags: [], weight: 1 },
    ];
    const stop = { ...base, donor_stated_reason: "Asked not to be called again" as const, preference: "stop_calls" as const, follow_up: { needed: false, action: "", due_date: null } };
    // No follow-up: no next step (not met, weight 3) and the stop was respected (met, weight 1) = 1 of 4.
    expect(rubricScore(evaluateRubric(pair, stop))).toEqual({ evaluated: 2, percent: 25 });
    // Follow-up booked after the stop: next step met (3), limit not respected (0) = 3 of 4.
    expect(rubricScore(evaluateRubric(pair, { ...stop, follow_up: { needed: true, action: "Call again", due_date: null } }))).toEqual({ evaluated: 2, percent: 75 });
  });

  it("leaves out weight 0 items and scores only evaluated, weighted items", () => {
    const weighted = [
      { id: "next_step", text: "x", supporting_tags: [], weight: 3 },
      { id: "thanked_by_name", text: "y", supporting_tags: [], weight: 1 },
      { id: "no_ask", text: "z", supporting_tags: [], weight: 0 },
    ];
    const results = evaluateRubric(weighted, { ...base, follow_up: { needed: true, action: "Send summary", due_date: null } });
    expect(status(results, "no_ask")).toBe("n_a");
    // One checked item is not enough for a percentage.
    expect(rubricScore(results)).toEqual({ evaluated: 1, percent: null });
    expect(rubricScore(evaluateRubric(weighted, { ...base, outcome: "voicemail" }))).toEqual({ evaluated: 0, percent: null });
    const two = [...weighted.slice(0, 1), { id: "respected_limit", text: "z", supporting_tags: [], weight: 1 }];
    expect(rubricScore(evaluateRubric(two, { ...base, follow_up: { needed: true, action: "Send summary", due_date: null } }))).toEqual({ evaluated: 1, percent: null });
  });
});
