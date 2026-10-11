import type { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { LogFields } from "@sc/shared";
import { describe, expect, it, vi } from "vitest";
import { modelDraft, modelWarmth } from "../src/services/postcallModel.ts";
import type { Deps } from "../src/services/context.ts";

const fields: LogFields = { outcome: "reached", donor_stated_reason: "Thanked for the gift", preference: "none", follow_up: { needed: false, action: "", due_date: null }, flags: [] };

function deps(output: string) {
  const send = vi.fn(async (_command: ConverseCommand) => ({ output: { message: { content: [{ text: output }] } } }));
  return { deps: { env: { AWS_REGION: "us-east-1", BEDROCK_MODEL_ID: "test-model" }, bedrock: { send } as unknown as BedrockRuntimeClient } as unknown as Deps, send };
}

describe("post-call Bedrock Converse wrapper", () => {
  it("uses only approved fields for warmth and validates a good response", async () => {
    const mock = deps(JSON.stringify({ score: 4, reason: "Friendly and engaged" }));
    expect(await modelWarmth(mock.deps, fields)).toEqual({ score: 4, reason: "Friendly and engaged" });
    expect(mock.send).toHaveBeenCalledTimes(1);
    const input = mock.send.mock.calls[0]![0].input;
    expect(input.messages?.[0]?.content?.[0]?.text).toBe(JSON.stringify(fields));
  });

  it("treats malformed JSON and out-of-range scores as unavailable", async () => {
    expect(await modelWarmth(deps("not JSON").deps, fields)).toBeNull();
    expect(await modelWarmth(deps('{"score":9,"reason":"guess"}').deps, fields)).toBeNull();
  });

  it("truncates reasons and rejects extra model fields", async () => {
    expect((await modelWarmth(deps(JSON.stringify({ score: 3, reason: "x".repeat(200) })).deps, fields))?.reason).toHaveLength(160);
    expect(await modelDraft(deps(JSON.stringify({ donor_stated_reason: "code", follow_up_action: "call", health: "guess" })).deps, "[NAME] requested a call back")).toBeNull();
  });
});
