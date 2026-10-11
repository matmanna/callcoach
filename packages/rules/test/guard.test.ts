import { describe, expect, it } from "vitest";
import { hasIdentifiers, scanForIdentifiers } from "../src/guard.ts";
import { buildKnownIdentifiers, redactTurn } from "../src/redact.ts";
import { donor, phraseRules, transcript } from "./fixtures.ts";

describe("guard", () => {
  it("counts each identifier type", () => {
    const text = "Call (814) 555-0142 or 814.555.0199, mail x@y.org, 12 Elm St, born 03/14/1952 and July 4, 1950.";
    expect(scanForIdentifiers(text)).toEqual({ phone: 2, email: 1, address: 1, dob: 2 });
    expect(hasIdentifiers(text)).toBe(true);
  });

  it("returns counts only", () => {
    const out = scanForIdentifiers("x@y.org");
    expect(Object.values(out).every((v) => typeof v === "number")).toBe(true);
  });

  it("is false on clean text and placeholders", () => {
    expect(hasIdentifiers("Thanks so much, [NAME]. Call [PHONE] at [ADDRESS].")).toBe(false);
  });

  it("is false on every fully scrubbed transcript turn", () => {
    const known = buildKnownIdentifiers(donor, transcript.volunteer_name ?? "");
    for (const t of transcript.turns) expect(hasIdentifiers(redactTurn(t, { known, phraseRules }).scrubbed)).toBe(false);
    // And the raw transcript does trip the guard.
    expect(transcript.turns.some((t) => hasIdentifiers(t.raw))).toBe(true);
  });
});
