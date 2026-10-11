import type { Db, MongoClient } from "mongodb";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { Auth } from "../auth/auth.ts";

export interface Deps {
  db: Db;
  client: MongoClient;
  auth: Auth;
  env: NodeJS.ProcessEnv;
  now?: () => Date;
  /** Injectable for tests; no client is constructed unless a model is configured. */
  bedrock?: BedrockRuntimeClient;
}

export const nowOf = (deps: Pick<Deps, "now">) => (deps.now ? deps.now() : new Date());
