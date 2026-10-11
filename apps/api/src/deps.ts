import { createAuth } from "./auth/auth.ts";
import { connectMongo } from "./db/client.ts";
import type { Deps } from "./services/context.ts";

export async function createDeps(env: NodeJS.ProcessEnv = process.env): Promise<Deps> {
  const { client, db } = await connectMongo(env.MONGODB_URI);
  return { client, db, auth: createAuth(db, client, env), env };
}
