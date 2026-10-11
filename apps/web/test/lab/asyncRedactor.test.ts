import { buildKnownIdentifiers } from "@sc/rules";
import { describe, expect, it } from "vitest";
import { redactTurnAsync, type AsyncRedactContext } from "../../src/lib/localAi/asyncRedactor.ts";
import type { NerEntity } from "../../src/lib/localAi/nerTypes.ts";
import { excerpts, nerAllowlist, phraseRules } from "../../src/lab/redaction/data.ts";

const x = excerpts.find((e) => e.id === "x05-unlisted-names")!;
const turn = x.turns.find((t) => t.raw.includes("Doris Albescu"))!;
const base = { known: buildKnownIdentifiers(x.donor, x.volunteer_name), phraseRules };

function ctx(run: (text: string) => Promise<NerEntity[]>, extra: Partial<AsyncRedactContext> = {}): AsyncRedactContext {
  return { ...base, ner: { enabled: true, run, options: { allowlist: nerAllowlist } }, ...extra };
}

describe("redactTurnAsync", () => {
  it("merges NER entities as layer 4 and reports counts", async () => {
    const run = async (text: string): Promise<NerEntity[]> => {
      const s = text.indexOf("Doris Albescu");
      const k = text.indexOf("Kofi");
      return [
        { start: s, end: s + 13, label: "PER", score: 0.99 },
        { start: k, end: k + 4, label: "PER", score: 0.97 },
        { start: 0, end: 5, label: "MISC", score: 0.99 },
      ];
    };
    const r = await redactTurnAsync(turn, ctx(run));
    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    expect(r.turn.scrubbed).not.toContain("Doris");
    expect(r.turn.scrubbed).not.toContain("Kofi");
    expect(r.ner).toEqual({ entities_found: 3, entities_used: 2, entities_allowlisted: 0 });
    expect(r.nerSkipped).toBe(false);
    expect(Object.keys(r.turn)).not.toContain("raw");
  });

  it("fails closed: NER error holds the turn and returns nothing sendable", async () => {
    const r = await redactTurnAsync(turn, ctx(async () => Promise.reject(new Error("model missing"))));
    expect(r.status).toBe("held");
    expect(r).not.toHaveProperty("turn");
  });

  it("returns the sync-only turn with a badge only after 'continue without NER'", async () => {
    const r = await redactTurnAsync(turn, ctx(async () => Promise.reject(new Error("x")), { continueWithoutNer: true }));
    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    expect(r.nerSkipped).toBe(true);
    expect(r.turn.scrubbed).toContain("Doris Albescu");
  });

  it("with NER disabled never calls the model", async () => {
    let calls = 0;
    const r = await redactTurnAsync(turn, { ...base, ner: { enabled: false, run: async () => (calls++, []) } });
    expect(r.status).toBe("ready");
    expect(calls).toBe(0);
  });
});
