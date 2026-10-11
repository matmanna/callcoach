/** audit_log: append and read only. There is no update or delete function, by design. */
import type { AuditDoc } from "@sc/shared";
import type { ClientSession, Db } from "mongodb";
import { randomUUID } from "node:crypto";
import { AUDIT_COLLECTION } from "./collections.ts";

export interface AuditEntry {
  org_id: string;
  who: string;
  action: string;
  target_type: string;
  target_id: string;
  note?: string | null;
}

export async function appendAudit(db: Db, entry: AuditEntry, session?: ClientSession): Promise<AuditDoc> {
  const doc: AuditDoc = { _id: randomUUID(), ...entry, note: entry.note ?? null, ts: new Date() };
  await db.collection<AuditDoc>(AUDIT_COLLECTION).insertOne(doc, { session });
  return doc;
}

export async function listAudit(db: Db, orgId: string, filter: { target_id?: string; action?: string } = {}, limit = 200): Promise<AuditDoc[]> {
  return db
    .collection<AuditDoc>(AUDIT_COLLECTION)
    .find({ org_id: orgId, ...filter })
    .sort({ ts: -1 })
    .limit(limit)
    .toArray();
}
