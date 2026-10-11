import { ApprovePayload, CueRule, Turn } from "@sc/shared";
import { describe, expect, it } from "vitest";

const valid = {
  idempotency_key: "k-1",
  donor_ref: "d-102",
  consent_ts: "2026-10-11T14:00:00Z",
  summary: "Thanked donor. Donor asked about the youth program and prefers email.",
  tags: ["PROGRAM_QUESTION", "EMAIL_PREFERRED"],
  redaction_counts: { NAME: 3, PHONE: 1 },
  client_version: "0.0.0",
};

describe("ApprovePayload", () => {
  it("accepts a valid payload", () => {
    expect(ApprovePayload.safeParse(valid).success).toBe(true);
  });
  it("rejects unknown keys", () => {
    expect(ApprovePayload.safeParse({ ...valid, transcript: "x" }).success).toBe(false);
  });
  it("rejects a summary over 400 characters", () => {
    expect(ApprovePayload.safeParse({ ...valid, summary: "a".repeat(401) }).success).toBe(false);
    expect(ApprovePayload.safeParse({ ...valid, summary: "a".repeat(400) }).success).toBe(true);
  });
  it("rejects an unknown tag", () => {
    expect(ApprovePayload.safeParse({ ...valid, tags: ["NOT_A_TAG"] }).success).toBe(false);
  });
  it("rejects negative or unknown redaction counts", () => {
    expect(ApprovePayload.safeParse({ ...valid, redaction_counts: { NAME: -1 } }).success).toBe(false);
    expect(ApprovePayload.safeParse({ ...valid, redaction_counts: { SSN: 1 } }).success).toBe(false);
  });
});

describe("CueRule", () => {
  it("rejects a fact rule without fact_id", () => {
    expect(CueRule.safeParse({ id: "F", type: "fact", priority: 3, triggers: ["x"] }).success).toBe(false);
  });
  it("rejects a fact rule with card_text", () => {
    expect(CueRule.safeParse({ id: "F", type: "fact", priority: 3, triggers: ["x"], fact_id: "f", card_text: "c" }).success).toBe(false);
  });
  it("rejects a non-fact rule without card_text", () => {
    expect(CueRule.safeParse({ id: "T", type: "tip", priority: 4, triggers: ["x"] }).success).toBe(false);
  });
  it("applies defaults", () => {
    const r = CueRule.parse({ id: "T", type: "tip", priority: 4, triggers: ["x"], card_text: "c" });
    expect(r.cooldown_s).toBe(60);
    expect(r.enabled).toBe(true);
  });
});

describe("Turn", () => {
  it("has no raw key and rejects one", () => {
    expect(Object.keys(Turn.shape)).not.toContain("raw");
    const t = { id: "a", speaker: "donor", scrubbed: "hi", redactions: [], t: 0 };
    expect(Turn.safeParse(t).success).toBe(true);
    expect(Turn.safeParse({ ...t, raw: "hi" }).success).toBe(false);
  });
});
