import { LogRulesFile } from "@sc/shared";
import { describe, expect, it } from "vitest";
import { draftFromNote } from "../src/logDraft.ts";
import { cueRules, readJson } from "./fixtures.ts";

const logRules = LogRulesFile.parse(readJson("log-rules.json"));
const draft = (note: string) => draftFromNote(note, { logRules, cueRules });

describe("draftFromNote", () => {
  it("'stop calling' maps to stop_calls and STOP_CONTACT, with no follow-up", () => {
    const d = draft("Reached her. She asked us to stop calling the house.");
    expect(d.preference).toBe("stop_calls");
    expect(d.flags).toEqual(["STOP_CONTACT"]);
    expect(d.donor_stated_reason).toBe("Asked not to be called again");
    expect(d.follow_up.needed).toBe(false);
  });

  it("detects voicemail and email preference with a follow-up action", () => {
    expect(draft("No luck, left a voicemail.").outcome).toBe("voicemail");
    const d = draft("Lovely chat. Prefers email; I said we'd send the program summary.");
    expect(d).toMatchObject({ outcome: "reached", preference: "email_preferred", follow_up: { needed: true, action: "Send the program summary" } });
  });

  it("flags distress from the phrase-rule placeholder", () => {
    const d = draft("[FAMILY: deceased, recent] in March. She was gracious.");
    expect(d.flags).toEqual(["DISTRESS"]);
    expect(d.donor_stated_reason).toBe("Shared a recent loss");
  });

  it("is deterministic and defaults to a thank-you", () => {
    expect(draft("Thanked them for the gift.")).toEqual({ outcome: "reached", donor_stated_reason: "Thanked for the gift", preference: "none", follow_up: { needed: false, action: "", due_date: null }, flags: [] });
  });

  it("only emits OFF_SCRIPT_CLAIM for a configured trigger", () => {
    expect(draft("I told them it is fully tax deductible.").flags).not.toContain("OFF_SCRIPT_CLAIM");
    expect(draft("I promised a guaranteed outcome.").flags).toContain("OFF_SCRIPT_CLAIM");
  });
});

describe("log-rules.json", () => {
  it("parses", () => expect(LogRulesFile.safeParse(readJson("log-rules.json")).success).toBe(true));
});
