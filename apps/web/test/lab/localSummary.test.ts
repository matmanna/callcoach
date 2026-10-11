import { buildKnownIdentifiers } from "@sc/rules";
import type { Turn } from "@sc/shared";
import { describe, expect, it } from "vitest";
import { summarizeLocally } from "../../src/lib/localAi/localSummary.ts";
import { excerpts } from "../../src/lab/redaction/data.ts";

const x = excerpts[0]!;
const known = buildKnownIdentifiers(x.donor, x.volunteer_name);
const turns: Turn[] = [{ id: "a", speaker: "donor", scrubbed: "[FAMILY: deceased, recent] in April.", redactions: [], t: 0 }];
const template = { tags: ["FAMILY_DECEASED_RECENT" as const], counts: { FAMILY: 1 }, cueRuleIds: ["DISTRESS_LOSS"] };

function fakeFetch(content: string, status = 200) {
  const calls: { url: string; body: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body) });
    return new Response(JSON.stringify({ message: { role: "assistant", content } }), { status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("summarizeLocally", () => {
  it("accepts valid JSON, sends only scrubbed turns, drops out-of-enum tags", async () => {
    const { f, calls } = fakeFetch(JSON.stringify({ summary: "Donor shared a recent family loss.", tags: ["FAMILY_DECEASED_RECENT", "VIP_DONOR"] }));
    const r = await summarizeLocally(turns, { fetch: f, known, template });
    expect(r).toMatchObject({ source: "llm", summary: "Donor shared a recent family loss.", tags: ["FAMILY_DECEASED_RECENT"], dropped_tags: ["VIP_DONOR"] });
    expect(calls[0]!.url).toBe("http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(calls[0]!.body);
    expect(body.options.temperature).toBe(0);
    expect(body.format).toBe("json");
    expect(body.messages[1].content).toBe("DONOR: [FAMILY: deceased, recent] in April.");
  });

  it("rejects a summary containing a known identifier and falls back to the template", async () => {
    const { f } = fakeFetch(JSON.stringify({ summary: `${x.donor.first_name} shared a loss.`, tags: [] }));
    const r = await summarizeLocally(turns, { fetch: f, known, template });
    expect(r).toMatchObject({ source: "template", rejected: "identifier", summary: "Donor mentioned a recent family loss. Other identifiers were removed: 1 family detail. 1 cue card was shown during the call." });
  });

  it("rejects a summary containing a regex identifier", async () => {
    const { f } = fakeFetch(JSON.stringify({ summary: "Call back on 814-555-0100.", tags: [] }));
    expect((await summarizeLocally(turns, { fetch: f, known, template })).source).toBe("template");
  });

  it("falls back on malformed JSON or an unreachable server", async () => {
    expect(await summarizeLocally(turns, { fetch: fakeFetch("not json").f, known, template })).toMatchObject({ source: "template", rejected: "invalid" });
    const down = (async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    expect(await summarizeLocally(turns, { fetch: down, known, template })).toMatchObject({ source: "template", rejected: "unreachable" });
  });
});
