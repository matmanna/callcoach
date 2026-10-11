import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { WARMTH_ANCHORS, type LogFields } from "@sc/shared";
import { z } from "zod";
import { createBedrockClient } from "../bedrock.ts";
import type { Deps } from "./context.ts";

export const DRAFT_PROMPT = `Return only JSON with donor_stated_reason (string, at most 160 characters) and follow_up_action (string, at most 120 characters). Use only the scrubbed note. Prefer a short stated reason code. Do not infer finances, health, family status, or intent. Do not include identifiers or quotes.`;
export const WARMTH_PROMPT = `Return only JSON with score (integer 1-5) and reason (string, at most 160 characters). Use only the approved structured log fields, with these anchors: ${JSON.stringify(WARMTH_ANCHORS)}. Do not infer finances, health, family status, or intent. Do not include identifiers or quotes.`;

const DraftOutput = z.strictObject({ donor_stated_reason: z.string(), follow_up_action: z.string() });
const WarmthOutput = z.strictObject({ score: z.number().int().min(1).max(5), reason: z.string() });

async function converse(deps: Deps, system: string, user: string): Promise<unknown | null> {
  const modelId = deps.env.BEDROCK_MODEL_ID;
  if (!modelId || !deps.env.AWS_REGION) return null;
  try {
    const client = deps.bedrock ?? createBedrockClient(deps.env);
    const response = await client.send(new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens: 300, temperature: 0 },
    }));
    const text = response.output?.message?.content?.find((part) => typeof part.text === "string")?.text;
    return text ? JSON.parse(text) as unknown : null;
  } catch {
    return null;
  }
}

export async function modelDraft(deps: Deps, scrubbedNote: string) {
  const value = await converse(deps, DRAFT_PROMPT, scrubbedNote);
  const parsed = DraftOutput.safeParse(value);
  return parsed.success
    ? { donor_stated_reason: parsed.data.donor_stated_reason.slice(0, 160), follow_up_action: parsed.data.follow_up_action.slice(0, 120) }
    : null;
}

export async function modelWarmth(deps: Deps, approved: LogFields) {
  const value = await converse(deps, WARMTH_PROMPT, JSON.stringify(approved));
  const parsed = WarmthOutput.safeParse(value);
  return parsed.success ? { score: parsed.data.score, reason: parsed.data.reason.slice(0, 160) } : null;
}
