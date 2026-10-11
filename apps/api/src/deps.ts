import { createAuth } from "./auth/auth.ts";
import { connectMongo } from "./db/client.ts";
import type { Deps } from "./services/context.ts";

/** MAIL_MODE=console prints invite links to the API log. Nothing else is supported in the hackathon. */
function consoleMail(env: NodeJS.ProcessEnv) {
  return (to: string, subject: string, body: string) => {
    if (env.MAIL_MODE !== "console") throw new Error(`MAIL_MODE=${env.MAIL_MODE ?? ""} is not supported; use console`);
    console.log(`[mail] to=${to} subject="${subject}" link=${body}`);
  };
}

export async function createDeps(env: NodeJS.ProcessEnv = process.env): Promise<Deps> {
  const { client, db } = await connectMongo(env.MONGODB_URI);
  return { client, db, auth: createAuth(db, client, env), env, mail: consoleMail(env) };
}
