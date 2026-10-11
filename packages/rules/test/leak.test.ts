import { describe, expect, it } from "vitest";
import { buildKnownIdentifiers, redactTurn } from "../src/redact.ts";
import { donor, phraseRules, planted, transcript } from "./fixtures.ts";

describe("leak test", () => {
  it("no planted identifier survives redaction", () => {
    const known = buildKnownIdentifiers(donor, transcript.volunteer_name ?? "");
    const scrubbed = transcript.turns.map((t) => redactTurn(t, { known, phraseRules }).scrubbed.toLowerCase());

    // Report which planted entries survive by index and type only, never the value.
    const surviving = planted
      .map((p, i) => ({ i, type: p.type, hit: scrubbed.some((s) => s.includes(p.value.toLowerCase())) }))
      .filter((p) => p.hit);
    console.log(`planted identifiers surviving redaction: ${surviving.length} of ${planted.length}`);
    expect(surviving.map(({ i, type }) => ({ i, type }))).toEqual([]);
  });

  it("every planted value actually appears in the raw transcript", () => {
    const raw = transcript.turns.map((t) => t.raw.toLowerCase());
    for (const p of planted) expect(raw.some((r) => r.includes(p.value.toLowerCase()))).toBe(true);
  });
});
