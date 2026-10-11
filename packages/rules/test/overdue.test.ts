import { describe, expect, it } from "vitest";
import { isOverdue } from "../src/overdue.ts";

describe("follow-up overdue state", () => {
  it("uses the team's calendar date rather than UTC", () => {
    const now = new Date("2026-10-12T01:00:00Z");
    expect(isOverdue("2026-10-11", now, "America/New_York")).toBe(false);
    expect(isOverdue("2026-10-10", now, "America/New_York")).toBe(true);
    expect(isOverdue("2026-10-11", now, "Asia/Tokyo")).toBe(true);
  });
});
