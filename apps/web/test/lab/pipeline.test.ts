import { DEFAULT_ENABLED_FLAGS } from "@sc/shared";
import { describe, expect, it } from "vitest";
import { excerpts } from "../../src/lab/redaction/data.ts";
import {
  buildOutbound,
  compareFlags,
  ledgerFor,
  matrixCsv,
  percentile,
  runPool,
  survivingPlanted,
  type MatrixRow,
} from "../../src/lab/redaction/pipeline.ts";

describe("dataset", () => {
  it("has 10 excerpts, 8-14 turns, 150-250 words, planted values present, default-enabled flags only", () => {
    expect(excerpts).toHaveLength(10);
    for (const x of excerpts) {
      expect(x.turns.length).toBeGreaterThanOrEqual(8);
      expect(x.turns.length).toBeLessThanOrEqual(14);
      const words = x.turns.reduce((n, t) => n + t.raw.split(/\s+/).length, 0);
      expect(words).toBeGreaterThanOrEqual(150);
      expect(words).toBeLessThanOrEqual(250);
      const raw = x.turns.map((t) => t.raw.toLowerCase()).join("\n");
      for (const p of x.planted) expect(raw).toContain(p.value.toLowerCase());
      for (const f of x.expected_flags) expect(DEFAULT_ENABLED_FLAGS).toContain(f);
    }
  });
});

describe("leak test per variant", () => {
  const totals = { M: 0, A: 0, N: 0 };
  const planted = excerpts.reduce((n, x) => n + x.planted.length, 0);
  for (const x of excerpts) {
    for (const v of ["M", "A", "N"] as const) totals[v] += survivingPlanted(x, buildOutbound(x, v).modelText).length;
  }
  it("N has zero planted survivors by construction", () => {
    expect(totals.N).toBe(0);
  });
  it("reports M and A honestly", () => {
    console.log(`planted identifiers surviving: M ${totals.M} of ${planted}, A ${totals.A} of ${planted}, N ${totals.N} of ${planted}`);
    expect(totals.A).toBeLessThanOrEqual(totals.M);
  });
});

describe("outbound payload", () => {
  it("never contains a raw key; ledger Y equals the JSON length sent", () => {
    for (const x of excerpts) {
      for (const v of ["M", "A", "N"] as const) {
        const out = buildOutbound(x, v);
        expect(Object.keys(out.body)).not.toContain("raw");
        expect(out.json).toBe(JSON.stringify(out.body));
        const l = ledgerFor(x, out);
        expect(l.sentChars).toBe(out.json.length);
        expect(l.stayedChars).toBe(x.turns.reduce((n, t) => n + t.raw.length, 0));
      }
    }
  });
});

describe("helpers", () => {
  it("compareFlags", () => {
    expect(compareFlags(["DISTRESS", "STOP_CONTACT"], ["DISTRESS", "OFF_SCRIPT_CLAIM"])).toEqual({ correct: ["DISTRESS"], missing: ["STOP_CONTACT"], extra: ["OFF_SCRIPT_CLAIM"] });
  });
  it("percentile", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(percentile([], 50)).toBeNull();
  });
  it("runPool caps concurrency at 2 and keeps order", async () => {
    let active = 0;
    let peak = 0;
    const out = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
  it("CSV has labels and counts only", () => {
    const row: MatrixRow = {
      excerptId: "x01",
      variant: "N",
      plantedTotal: 10,
      survivorsNerOff: 0,
      survivorsNerOn: null,
      guard: "passed",
      result: null,
      expected: ["DISTRESS"],
      comparison: null,
    };
    expect(matrixCsv([row]).split("\n")[1]).toBe("x01,N,10,0,,passed,,,,DISTRESS,,,,,,,");
  });
});
