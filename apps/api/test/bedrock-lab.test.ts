import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { endRead, parseLabModelOutput, setLabConverseSenderForTests } from "../src/services/lab/bedrockLab.ts";
import { createSession } from "../src/services/lab/turnSession.ts";
afterEach(() => { setLabConverseSenderForTests(); delete process.env.AWS_REGION; delete process.env.BEDROCK_MODEL_ID; delete process.env.LAB_MAX_BEDROCK_CALLS; delete process.env.MOCK_BEDROCK; vi.useRealTimers(); });
describe("Bedrock lab output", () => {
  it("accepts strict valid output and rejects malformed and unenabled labels", () => {
    expect(parseLabModelOutput('{"label":"DISTRESS","reason":"supported"}', "rolling")).toMatchObject({ label: "DISTRESS" });
    expect(parseLabModelOutput("not json", "rolling")).toBeNull();
    expect(parseLabModelOutput('{"label":"PLANNED_GIVING","reason":"unsupported"}', "rolling")).toBeNull();
    expect(parseLabModelOutput('{"flags":[{"label":"STOP_CONTACT","reason":"supported"}]}', "end")).not.toBeNull();
  });
  it("uses an injected Converse sender, validates response JSON, and records token use", async () => {
    process.env.AWS_REGION = "us-east-1"; process.env.BEDROCK_MODEL_ID = "test-model";
    const sender = vi.fn(async () => ({ output: { message: { content: [{ text: '{"flags":[]}' }] } }, usage: { inputTokens: 12, outputTokens: 3 }, metrics: { latencyMs: 42 } }) as unknown as ConverseCommandOutput);
    setLabConverseSenderForTests(sender);
    const session = createSession("bedrock-test", "d-102", "rules_end");
    const result = await endRead(session, "Synthetic placeholder note", []);
    expect(result.value).toEqual({ flags: [] }); expect(sender).toHaveBeenCalledOnce();
    expect(session.bedrock[0]).toMatchObject({ status: "ok", input_tokens: 12, output_tokens: 3, response_latency_ms: 42 });
  });
  it("skips guarded inputs and enforces the per-session call cap", async () => {
    const sender = vi.fn(); setLabConverseSenderForTests(sender as never);
    const guarded = createSession("guarded", "d-102", "rules_end");
    expect((await endRead(guarded, "contact user@example.org", [])).value).toBeNull(); expect(sender).not.toHaveBeenCalled();
    process.env.LAB_MAX_BEDROCK_CALLS = "0";
    const capped = createSession("capped", "d-102", "rules_end");
    expect((await endRead(capped, "safe note", [])).value).toBeNull(); expect(capped.bedrock[0]?.status).toBe("cap_reached");
  });
});
