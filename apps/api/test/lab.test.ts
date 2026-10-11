import { afterEach, describe, expect, it } from "vitest";
import { app } from "../src/app.ts";

const post = (path: string, body: unknown) => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const turn = (id: string, scrubbed: string) => ({ id, speaker: "donor", scrubbed, redactions: [], t: 0 });
afterEach(() => { delete process.env.LAB_ENABLED; delete process.env.MOCK_BEDROCK; });
describe("lab API guard and idempotency", () => {
  it("gates lab routes with a 404", async () => { delete process.env.LAB_ENABLED; expect((await app.request("/lab/calls")).status).toBe(404); });
  it("rejects raw keys and identifier-bearing turns without returning text", async () => {
    process.env.LAB_ENABLED = "1";
    const session = await (await post("/lab/calls", { donor_id: "d-102", mode: "rules_only" })).json() as { call_id: string };
    const raw = await post(`/lab/calls/${session.call_id}/turns`, { idempotency_key: "a", turn: { ...turn("t-1", "hi"), raw: "never disclose" } });
    expect(raw.status).toBe(400); expect(await raw.text()).not.toContain("never disclose");
    const pii = await post(`/lab/calls/${session.call_id}/turns`, { idempotency_key: "b", turn: turn("t-2", "email me at secretperson@example.org") });
    expect(pii.status).toBe(422); const body = await pii.text(); expect(body).toContain("email"); expect(body).not.toContain("secretperson");
  });
  it("replays duplicates without consuming cue state and returns expected server cue IDs", async () => {
    process.env.LAB_ENABLED = "1";
    const session = await (await post("/lab/calls", { donor_id: "d-102", mode: "rules_only" })).json() as { call_id: string };
    const send = (key: string, t: ReturnType<typeof turn>) => post(`/lab/calls/${session.call_id}/turns`, { idempotency_key: key, turn: t });
    const loss = await (await send("loss", turn("t-loss", "I lost my husband, and he passed away."))).json() as { cue: { rule_id: string } };
    expect(loss.cue.rule_id).toBe("DISTRESS_LOSS");
    const first = { idempotency_key: "program", turn: turn("t-program", "Please stop calling me.") };
    const response1 = await (await post(`/lab/calls/${session.call_id}/turns`, first)).json();
    const replay = await (await post(`/lab/calls/${session.call_id}/turns`, { ...first, turn: turn("changed", "What does the youth program actually do?") })).json();
    expect(replay).toEqual(response1);
    const later = await (await send("program-2", turn("t-program-2", "What does the youth program actually do?"))).json() as { cue: { rule_id: string } };
    expect(later.cue.rule_id).toBe("PROGRAM_Q");
    const stop = await (await send("stop", { ...turn("t-stop", "Please stop calling me."), t: 61_000 })).json() as { cue: { rule_id: string; dnc_candidate: boolean } };
    expect(stop.cue).toMatchObject({ rule_id: "STOP_CONTACT", dnc_candidate: true });
  });
});
