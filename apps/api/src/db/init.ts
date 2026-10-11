/**
 * Creates collections, indexes, and the app role. Idempotent. Bump SCHEMA_VERSION with any
 * additive change and describe it in SCHEMA_CHANGES.
 */
import type { Db } from "mongodb";
import { AUDIT_COLLECTION, AUTH_COLLECTIONS, TENANT_COLLECTIONS } from "./collections.ts";

export const SCHEMA_VERSION = 1;
export const SCHEMA_CHANGES: Record<number, string> = {
  1: "S2: identity, teams, memberships, invites, donors, gifts, campaigns, fact_sheets, rubrics, seed_runs, audit_log.",
};

export const APP_ROLE = "stewardship_app";

export async function initDb(db: Db, log: (s: string) => void = () => {}): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of [...TENANT_COLLECTIONS, ...AUTH_COLLECTIONS, AUDIT_COLLECTION, "schema_versions"]) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      log(`created collection ${name}`);
    }
  }

  await db.collection("organizations").createIndex({ slug: 1 }, { unique: true });
  await db.collection("teams").createIndex({ org_id: 1, parent_team_id: 1 });
  await db.collection("memberships").createIndex({ user_id: 1, team_id: 1 }, { unique: true });
  await db.collection("memberships").createIndex({ org_id: 1, team_id: 1 });
  await db.collection("invites").createIndex({ token_hash: 1 }, { unique: true });
  await db.collection("invites").createIndex({ org_id: 1, team_id: 1 });
  await db.collection("donors").createIndex({ org_id: 1, external_id: 1 }, { unique: true });
  await db.collection("donors").createIndex({ org_id: 1, team_ids: 1 });
  await db.collection("gifts").createIndex({ org_id: 1, external_id: 1 }, { unique: true });
  await db.collection("gifts").createIndex({ org_id: 1, donor_id: 1 });
  await db.collection("campaigns").createIndex({ org_id: 1, name: 1 }, { unique: true });
  await db.collection("fact_sheets").createIndex({ org_id: 1 });
  await db.collection("rubrics").createIndex({ org_id: 1, team_id: 1 });
  await db.collection("seed_runs").createIndex({ org_id: 1, created_at: -1 });
  await db.collection(AUDIT_COLLECTION).createIndex({ org_id: 1, ts: -1 });
  await db.collection(AUDIT_COLLECTION).createIndex({ org_id: 1, target_id: 1, ts: -1 });
  log("indexes ensured");

  await ensureAppRole(db, log);

  await db
    .collection<{ _id: number; description: string; applied_at: Date }>("schema_versions")
    .updateOne({ _id: SCHEMA_VERSION }, { $setOnInsert: { description: SCHEMA_CHANGES[SCHEMA_VERSION] ?? "", applied_at: new Date() } }, { upsert: true });
  log(`schema version ${SCHEMA_VERSION}`);
}

/**
 * Least-privilege role for the API: full CRUD on app collections, but only find + insert on
 * audit_log. Enforced only when the deployment runs with authentication (Atlas does; the local
 * dev container does not). Create a user with this role for the API's MONGODB_URI.
 */
export async function ensureAppRole(db: Db, log: (s: string) => void = () => {}): Promise<void> {
  const crud = ["find", "insert", "update", "remove", "createIndex", "createCollection"];
  const privileges = [
    ...[...TENANT_COLLECTIONS, ...AUTH_COLLECTIONS, "schema_versions"].map((collection) => ({ resource: { db: db.databaseName, collection }, actions: crud })),
    { resource: { db: db.databaseName, collection: AUDIT_COLLECTION }, actions: ["find", "insert", "createIndex"] },
  ];
  try {
    const info = (await db.command({ rolesInfo: APP_ROLE })) as { roles: unknown[] };
    if (info.roles.length) await db.command({ updateRole: APP_ROLE, privileges, roles: [] });
    else await db.command({ createRole: APP_ROLE, privileges, roles: [] });
    log(`role ${APP_ROLE}: audit_log is find + insert only`);
  } catch (err) {
    // Atlas manages roles in its UI/API; report instead of failing init.
    log(`role ${APP_ROLE} not created here (${err instanceof Error ? err.message.slice(0, 120) : "error"}); create it in Atlas with the same privileges`);
  }
}
