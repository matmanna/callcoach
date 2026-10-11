/** Versioned stated limits and preferences. Old versions are kept with their dates. */
import type { DonorDoc, DonorLimitDoc } from "@sc/shared";
import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { appendAudit } from "../../db/audit.ts";
import { collections } from "../../db/collections.ts";
import { withTx } from "../../db/tx.ts";
import { HttpError, notFound } from "../../http.ts";
import { nowOf, type Deps } from "../context.ts";

const dateOf = (d: Date) => d.toISOString().slice(0, 10);

/** Donors imported with `limits` text get version-1 records the first time the dossier is opened. */
export async function ensureLimitRecords(deps: Deps, donor: DonorDoc, actor: string): Promise<void> {
  const c = collections(deps.db);
  if (!donor.limits.length || (await c.donor_limits.countDocuments({ org_id: donor.org_id, donor_id: donor._id, kind: "limit" }, { limit: 1 }))) return;
  // Deterministic keys: two concurrent first opens collide on the unique (donor, key, version)
  // index instead of both inserting, so version 1 is written exactly once.
  const docs: DonorLimitDoc[] = donor.limits.map((value, i) => ({
    _id: randomUUID(),
    org_id: donor.org_id,
    donor_id: donor._id,
    key: `import-${i + 1}`,
    kind: "limit",
    version: 1,
    value,
    source: "Imported with the donor record",
    stated_on: dateOf(donor.created_at),
    status: "active",
    created_by: actor,
    created_at: nowOf(deps),
  }));
  try {
    await c.donor_limits.insertMany(docs, { ordered: false });
  } catch (err) {
    // A concurrent first open inserted them already (duplicate key). Safe to ignore.
    const e = err as { code?: number; writeErrors?: Array<{ code?: number }> };
    if (e.code !== 11000 && !(e.writeErrors?.length && e.writeErrors.every((w) => w.code === 11000))) throw err;
  }
}

export async function activeLimitDocs(deps: Deps, orgId: string, donorId: string, kind?: "limit" | "preference") {
  const all = await collections(deps.db)
    .donor_limits.find({ org_id: orgId, donor_id: donorId, ...(kind ? { kind } : {}) })
    .sort({ key: 1, version: 1 })
    .toArray();
  const latest = new Map<string, DonorLimitDoc>();
  for (const d of all) latest.set(d.key, d);
  return [...latest.values()].filter((d) => d.status === "active");
}

/** Keep donors.limits (read by briefs) equal to the active limit values. */
async function syncDonorLimits(deps: Deps, orgId: string, donorId: string, session: ClientSession) {
  const c = collections(deps.db);
  const all = await c.donor_limits.find({ org_id: orgId, donor_id: donorId, kind: "limit" }, { session }).sort({ key: 1, version: 1 }).toArray();
  const latest = new Map<string, DonorLimitDoc>();
  for (const d of all) latest.set(d.key, d);
  const values = [...latest.values()].filter((d) => d.status === "active").map((d) => d.value);
  await c.donors.updateOne({ _id: donorId, org_id: orgId }, { $set: { limits: values, updated_at: nowOf(deps) } }, { session });
}

export interface LimitInput {
  action: "add" | "edit" | "remove";
  key?: string | undefined;
  value?: string | undefined;
  source: string;
  stated_on: string;
}

export async function changeLimit(deps: Deps, orgId: string, donor: DonorDoc, actor: string, input: LimitInput, kind: "limit" | "preference" = "limit"): Promise<DonorLimitDoc> {
  await ensureLimitRecords(deps, donor, actor);
  const c = collections(deps.db);
  const now = nowOf(deps);
  return withTx(deps.client, async (session) => {
    let doc: DonorLimitDoc;
    if (input.action === "add") {
      if (!input.value) throw new HttpError(400, "invalid_payload", { issues: [{ path: "value", message: "value is required" }] });
      doc = { _id: randomUUID(), org_id: orgId, donor_id: donor._id, key: randomUUID(), kind, version: 1, value: input.value, source: input.source, stated_on: input.stated_on, status: "active", created_by: actor, created_at: now };
    } else {
      if (!input.key) throw new HttpError(400, "invalid_payload", { issues: [{ path: "key", message: "key is required" }] });
      const versions = await c.donor_limits.find({ org_id: orgId, donor_id: donor._id, key: input.key }, { session }).sort({ version: 1 }).toArray();
      const current = versions.at(-1);
      if (!current || current.status !== "active") throw notFound();
      if (input.action === "edit" && !input.value) throw new HttpError(400, "invalid_payload", { issues: [{ path: "value", message: "value is required" }] });
      await c.donor_limits.updateOne({ _id: current._id }, { $set: { status: "superseded" } }, { session });
      doc = {
        _id: randomUUID(),
        org_id: orgId,
        donor_id: donor._id,
        key: current.key,
        kind: current.kind,
        version: current.version + 1,
        value: input.action === "edit" ? input.value! : current.value,
        source: input.source,
        stated_on: input.stated_on,
        status: input.action === "remove" ? "removed" : "active",
        created_by: actor,
        created_at: now,
      };
    }
    await c.donor_limits.insertOne(doc, { session });
    if (doc.kind === "limit") await syncDonorLimits(deps, orgId, donor._id, session);
    await appendAudit(deps.db, { org_id: orgId, who: actor, action: `contact.${doc.kind}.${input.action}`, target_type: "donor", target_id: donor._id, note: `v${doc.version}` }, session);
    return doc;
  });
}

/** Full history, newest first, grouped by key by the caller. */
export async function limitHistory(deps: Deps, orgId: string, donorId: string): Promise<DonorLimitDoc[]> {
  return collections(deps.db).donor_limits.find({ org_id: orgId, donor_id: donorId }).sort({ created_at: -1, version: -1 }).toArray();
}
