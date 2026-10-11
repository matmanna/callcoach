import { describe, expect, it } from "vitest";
import { isInCallPath } from "../src/lib/callRoutes.ts";

describe("isInCallPath", () => {
  it("is true for a donor's call, brief, and post-call pages", () => {
    expect(isInCallPath("/call/abc123")).toBe(true);
    expect(isInCallPath("/call/abc123/brief")).toBe(true);
    expect(isInCallPath("/call/abc123/post")).toBe(true);
  });

  it("is false for the call list and the other signed-in pages", () => {
    expect(isInCallPath("/calls")).toBe(false);
    expect(isInCallPath("/home")).toBe(false);
    expect(isInCallPath("/coordinator/calls/abc")).toBe(false);
    expect(isInCallPath("/logs/abc/warmth")).toBe(false);
  });
});
