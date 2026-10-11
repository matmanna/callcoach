import type { Db, MongoClient } from "mongodb";
import type { Auth } from "../auth/auth.ts";

export interface Deps {
  db: Db;
  client: MongoClient;
  auth: Auth;
  env: NodeJS.ProcessEnv;
  /** Where invite links go when MAIL_MODE=console. Tests capture it. */
  mail: (to: string, subject: string, body: string) => void;
  now?: () => Date;
}

export const nowOf = (deps: Pick<Deps, "now">) => (deps.now ? deps.now() : new Date());
