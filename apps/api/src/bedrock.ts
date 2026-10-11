import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

/** Builds the client from env. Makes no calls. Credentials resolve via AWS_PROFILE / default chain. */
export function createBedrockClient(env: NodeJS.ProcessEnv = process.env): BedrockRuntimeClient {
  const region = env.AWS_REGION;
  if (!region) throw new Error("AWS_REGION is not set (see .env.example)");
  return new BedrockRuntimeClient({ region });
}

export function bedrockModelId(env: NodeJS.ProcessEnv = process.env): string {
  const id = env.BEDROCK_MODEL_ID;
  if (!id) throw new Error("BEDROCK_MODEL_ID is not set (see .env.example)");
  return id;
}
