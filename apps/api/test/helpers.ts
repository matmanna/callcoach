/**
 * Integration-test harness: real MongoDB (docker compose), one throwaway database per test file,
 * real Better Auth sessions over HTTP. Requires `docker compose up -d`.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth/auth.ts";
import { connectMongo } from "../src/db/client.ts";
import { initDb } from "../src/db/init.ts";
import type { Deps } from "../src/services/context.ts";

export const ORIGIN = "http://localhost:5173";
const URI = process.env.MONGODB_URI_TEST ?? "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";

export interface Harness {
  deps: Deps;
  app: ReturnType<typeof createApp>;
  mails: Array<{ to: string; link: string }>;
  clock: { now: Date };
  close(): Promise<void>;
}

export async function harness(): Promise<Harness> {
  const name = `sc_test_${randomBytes(4).toString("hex")}`;
  let mongo;
  try {
    mongo = await connectMongo(URI, name);
  } catch (err) {
    throw new Error(`MongoDB not reachable at ${URI}. Run: docker compose up -d (${err instanceof Error ? err.message : ""})`);
  }
  await initDb(mongo.db);
  const env = { BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789", BETTER_AUTH_URL: ORIGIN, APP_ORIGIN: ORIGIN, MAIL_MODE: "console" };
  const mails: Harness["mails"] = [];
  const clock = { now: new Date() };
  const deps: Deps = {
    ...mongo,
    env,
    auth: createAuth(mongo.db, mongo.client, env),
    mail: (to, _s, link) => mails.push({ to, link }),
    now: () => clock.now,
  };
  return {
    deps,
    app: createApp(deps),
    mails,
    clock,
    async close() {
      await mongo.db.dropDatabase();
      await mongo.client.close();
    },
  };
}

export class Client {
  cookie = "";
  constructor(private h: Harness) {}
  async req(method: string, path: string, body?: unknown): Promise<{ status: number; json: any; text: string; headers: Headers }> {
    const res = await this.h.app.request(path, {
      method,
      headers: { "content-type": "application/json", origin: ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const set = res.headers.getSetCookie();
    if (set.length) this.cookie = set.map((s) => s.split(";")[0]).join("; ");
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text, headers: res.headers };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b?: unknown) => this.req("POST", p, b ?? {});
  patch = (p: string, b?: unknown) => this.req("PATCH", p, b ?? {});
}

export async function signUpCoordinator(h: Harness, email: string, orgName: string) {
  const c = new Client(h);
  const r = await c.post("/api/auth/sign-up/email", { email, password: "test-password-123", name: "Coord", user_type: "coordinator" });
  if (r.status !== 200) throw new Error(`sign-up failed ${r.status} ${r.text}`);
  const o = await c.post("/api/onboarding/coordinator", { display_name: "Coord", org_name: orgName, timezone: "America/New_York" });
  if (o.status !== 201) throw new Error(`onboarding failed ${o.status} ${o.text}`);
  return { client: c, rootTeamId: o.json.root_team._id as string, orgId: o.json.org._id as string };
}

export async function inviteAndAccept(h: Harness, coord: Client, teamId: string, email: string, role: "caller" | "coordinator" = "caller") {
  const inv = await coord.post(`/api/teams/${teamId}/invites`, { email, role });
  if (inv.status !== 201) throw new Error(`invite failed ${inv.status} ${inv.text}`);
  const token = h.mails.at(-1)!.link.split("/invite/")[1]!;
  const v = new Client(h);
  const a = await v.post("/api/invites/accept", { token, password: "volunteer-pass-123", display_name: "Vol", timezone: "America/Chicago" });
  if (a.status !== 200) throw new Error(`accept failed ${a.status} ${a.text}`);
  return { client: v, token, inviteId: inv.json.invite._id as string };
}

export const seedFile = (name: string) => readFileSync(new URL(`../../../data/seed/${name}`, import.meta.url), "utf8");
