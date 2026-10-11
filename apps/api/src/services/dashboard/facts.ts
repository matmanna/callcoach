/**
 * Fact sheet editing with versions. Editing creates a draft version; the approved version stays
 * live for callers until a new version is approved. Items stay mirrored on fact_sheets.items so
 * the S2 caller routes and briefs keep working.
 */
import { scanForIdentifiers } from "@sc/rules";
import type { FactItem, FactItemVersionDoc, FactSheetDoc } from "@sc/shared";
import { randomUUID } from "node:crypto";
import type { Access } from "../../auth/access.ts";
import { appendAudit } from "../../db/audit.ts";
import { collections } from "../../db/collections.ts";
import { withTx } from "../../db/tx.ts";
import { HttpError, notFound } from "../../http.ts";
import { nowOf, type Deps } from "../context.ts";
import { displayNames } from "./util.ts";

export const staleDays = (deps: Pick<Deps, "env">) => Number(deps.env.FACT_STALE_DAYS ?? 365) || 365;

export function isStale(verifiedOn: string, now: Date, days: number): boolean {
  return new Date(`${verifiedOn}T00:00:00Z`).getTime() < now.getTime() - days * 86_400_000;
}

/** Warnings for donor-specific content: a donor's name, or a phone, email, address, or birth date. */
export async function factWarnings(deps: Deps, orgId: string, text: string): Promise<string[]> {
  const warnings: string[] = [];
  const g = scanForIdentifiers(text);
  if (g.phone) warnings.push("Contains a phone number.");
  if (g.email) warnings.push("Contains an email address.");
  if (g.address) warnings.push("Contains a street address.");
  if (g.dob) warnings.push("Contains a date of birth.");
  const donors = await collections(deps.db).donors.find({ org_id: orgId }, { projection: { first_name: 1, last_name: 1 } }).limit(5000).toArray();
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const d of donors) {
    for (const n of [d.first_name, d.last_name]) {
      if (n.length >= 3 && new RegExp(`(?<![\\p{L}\\p{N}_])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu").test(lower)) hits.add(n.length > 0 ? "name" : "");
    }
  }
  if (hits.size) warnings.push("Contains a name from the donor list.");
  return warnings;
}

/** Lazily create version 1 for items that predate versioning (imported or approved in S2). */
export async function ensureVersions(deps: Deps, sheet: FactSheetDoc): Promise<void> {
  const c = collections(deps.db);
  const have = new Set((await c.fact_item_versions.find({ org_id: sheet.org_id, sheet_id: sheet._id }, { projection: { item_id: 1 } }).toArray()).map((v) => v.item_id));
  const missing = sheet.items.filter((i) => !have.has(i.id));
  if (!missing.length) return;
  const docs: FactItemVersionDoc[] = missing.map((i) => ({
    _id: randomUUID(),
    org_id: sheet.org_id,
    sheet_id: sheet._id,
    item_id: i.id,
    version: 1,
    text: i.text,
    source: i.source,
    verified_on: i.verified_on,
    owner_user_id: i.owner_user_id,
    status: i.status === "approved" ? "approved" : "draft",
    created_by: i.owner_user_id,
    created_at: sheet.created_at,
    approved_by: i.status === "approved" ? i.owner_user_id : null,
    approved_at: i.status === "approved" ? sheet.created_at : null,
    self_approved: i.status === "approved",
    note: null,
  }));
  try {
    await c.fact_item_versions.insertMany(docs, { ordered: false });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000 && !(err as { writeErrors?: unknown[] }).writeErrors) throw err;
  }
}

export async function loadSheet(deps: Deps, orgId: string, sheetId: string): Promise<FactSheetDoc> {
  const sheet = await collections(deps.db).fact_sheets.findOne({ _id: sheetId, org_id: orgId });
  if (!sheet) throw notFound();
  await ensureVersions(deps, sheet);
  return sheet;
}

export async function listSheets(deps: Deps, orgId: string, campaignName?: string) {
  const c = collections(deps.db);
  let sheets = await c.fact_sheets.find({ org_id: orgId }).sort({ created_at: -1 }).toArray();
  if (campaignName) {
    const camp = await c.campaigns.findOne({ org_id: orgId, name: campaignName });
    const ids = new Set(camp?.fact_sheet_ids ?? []);
    sheets = sheets.filter((s) => ids.has(s._id));
  }
  for (const s of sheets) await ensureVersions(deps, s);
  const versions = await c.fact_item_versions.find({ org_id: orgId, sheet_id: { $in: sheets.map((s) => s._id) } }).sort({ version: 1 }).toArray();
  const names = await displayNames(deps, [...versions.map((v) => v.owner_user_id), ...versions.map((v) => v.created_by)]);
  const now = nowOf(deps);
  const days = staleDays(deps);
  const campaigns = await c.campaigns.find({ org_id: orgId }).toArray();
  return {
    stale_after_days: days,
    fact_sheets: sheets.map((s) => ({
      id: s._id,
      _id: s._id, // kept for S2 clients
      name: s.name,
      campaigns: campaigns.filter((cp) => cp.fact_sheet_ids.includes(s._id)).map((cp) => cp.name),
      items: s.items.map((item) => {
        const vs = versions.filter((v) => v.sheet_id === s._id && v.item_id === item.id);
        const approved = vs.filter((v) => v.status === "approved").at(-1) ?? null;
        const draft = vs.filter((v) => v.status === "draft").at(-1) ?? null;
        const view = (v: FactItemVersionDoc | null) =>
          v && {
            version: v.version,
            text: v.text,
            source: v.source,
            verified_on: v.verified_on,
            owner: names.get(v.owner_user_id) ?? "",
            owner_user_id: v.owner_user_id,
            created_by: names.get(v.created_by) ?? "",
            created_by_id: v.created_by,
            self_approved: v.self_approved,
          };
        const shown = approved ?? draft;
        const stale = !!approved && isStale(approved.verified_on, now, days);
        return {
          id: item.id,
          status: stale ? "stale" : approved ? "approved" : "draft",
          version: shown?.version ?? 1,
          approved: view(approved),
          draft: view(draft),
          has_pending_draft: !!draft && (!approved || draft.version > approved.version),
          history: vs.map((v) => ({ version: v.version, status: v.status, text: v.text, source: v.source, verified_on: v.verified_on, created_at: v.created_at, created_by: names.get(v.created_by) ?? "" })),
        };
      }),
    })),
  };
}

export async function createVersion(
  deps: Deps,
  access: Access,
  orgId: string,
  sheetId: string,
  input: { item_id?: string | undefined; text: string; source: string; verified_on: string; owner_user_id: string },
  note: string | null = null,
) {
  const c = collections(deps.db);
  const sheet = await loadSheet(deps, orgId, sheetId);
  const owner = await c.memberships.findOne({ org_id: orgId, user_id: input.owner_user_id, status: "active" });
  if (!owner) throw new HttpError(422, "owner_not_in_org");
  const warnings = await factWarnings(deps, orgId, input.text);
  const now = nowOf(deps);
  let itemId = input.item_id;
  const isNew = !itemId;
  if (!itemId) itemId = randomUUID();
  else if (!sheet.items.some((i) => i.id === itemId)) throw notFound();

  const doc = await withTx(deps.client, async (session) => {
    const prior = await c.fact_item_versions.find({ org_id: orgId, sheet_id: sheetId, item_id: itemId }, { session }).sort({ version: 1 }).toArray();
    const next = (prior.at(-1)?.version ?? 0) + 1;
    // One pending draft at a time: a new draft supersedes the previous one.
    await c.fact_item_versions.updateMany({ org_id: orgId, sheet_id: sheetId, item_id: itemId, status: "draft" }, { $set: { status: "superseded" } }, { session });
    const v: FactItemVersionDoc = {
      _id: randomUUID(),
      org_id: orgId,
      sheet_id: sheetId,
      item_id: itemId!,
      version: next,
      text: input.text,
      source: input.source,
      verified_on: input.verified_on,
      owner_user_id: input.owner_user_id,
      status: "draft",
      created_by: access.user.id,
      created_at: now,
      approved_by: null,
      approved_at: null,
      self_approved: false,
      note,
    };
    await c.fact_item_versions.insertOne(v, { session });
    if (isNew) {
      const item: FactItem = { id: itemId!, text: v.text, source: v.source, verified_on: v.verified_on, owner_user_id: v.owner_user_id, status: "draft" };
      await c.fact_sheets.updateOne({ _id: sheetId, org_id: orgId }, { $push: { items: item } }, { session });
    } else if (!prior.some((p) => p.status === "approved")) {
      // No live approved version yet: mirror the draft so it shows in the sheet (still status draft).
      await c.fact_sheets.updateOne({ _id: sheetId, org_id: orgId, "items.id": itemId }, { $set: { "items.$.text": v.text, "items.$.source": v.source, "items.$.verified_on": v.verified_on, "items.$.owner_user_id": v.owner_user_id } }, { session });
    }
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "fact.draft", target_type: "fact_item", target_id: itemId!, note: `v${next}` }, session);
    return v;
  });
  return { item_id: itemId, version: doc.version, warnings };
}

export async function coordinatorCount(deps: Deps, orgId: string): Promise<number> {
  const rows = await collections(deps.db).memberships.distinct("user_id", { org_id: orgId, role: "coordinator", status: "active" });
  return rows.length;
}

/**
 * Approve a draft version. With more than one coordinator in the org the approver must differ
 * from the draft's author; with one, the approval is recorded as a self-approval in the audit log.
 */
export async function approveVersion(deps: Deps, access: Access, orgId: string, sheetId: string, itemId: string, version: number, note?: string) {
  const c = collections(deps.db);
  await loadSheet(deps, orgId, sheetId);
  const v = await c.fact_item_versions.findOne({ org_id: orgId, sheet_id: sheetId, item_id: itemId, version });
  if (!v) throw notFound();
  if (v.status !== "draft") throw new HttpError(409, "not_a_draft", { status: v.status });
  const warnings = await factWarnings(deps, orgId, v.text);
  if (warnings.length) throw new HttpError(422, "donor_specific_content", { warnings });
  const multi = (await coordinatorCount(deps, orgId)) > 1;
  if (multi && v.created_by === access.user.id) throw new HttpError(403, "second_approver_required");
  const self = !multi && v.created_by === access.user.id;
  const now = nowOf(deps);
  await withTx(deps.client, async (session) => {
    await c.fact_item_versions.updateMany({ org_id: orgId, sheet_id: sheetId, item_id: itemId, status: "approved" }, { $set: { status: "superseded" } }, { session });
    await c.fact_item_versions.updateOne({ _id: v._id, status: "draft" }, { $set: { status: "approved", approved_by: access.user.id, approved_at: now, self_approved: self } }, { session });
    await c.fact_sheets.updateOne(
      { _id: sheetId, org_id: orgId, "items.id": itemId },
      { $set: { "items.$.text": v.text, "items.$.source": v.source, "items.$.verified_on": v.verified_on, "items.$.owner_user_id": v.owner_user_id, "items.$.status": "approved" } },
      { session },
    );
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: self ? "fact.approve.self" : "fact.approve", target_type: "fact_item", target_id: itemId, note: [`v${version}`, self ? "self-approval (single coordinator)" : null, note].filter(Boolean).join("; ") }, session);
  });
  return { item_id: itemId, version, approved: true, self_approved: self };
}

/** Re-verify: a new version with updated source and verified_on. It still needs approval. */
export async function reverifyItem(deps: Deps, access: Access, orgId: string, sheetId: string, itemId: string, input: { source: string; verified_on: string }) {
  const c = collections(deps.db);
  await loadSheet(deps, orgId, sheetId);
  const vs = await c.fact_item_versions.find({ org_id: orgId, sheet_id: sheetId, item_id: itemId }).sort({ version: 1 }).toArray();
  const base = vs.filter((v) => v.status === "approved").at(-1) ?? vs.at(-1);
  if (!base) throw notFound();
  return createVersion(deps, access, orgId, sheetId, { item_id: itemId, text: base.text, source: input.source, verified_on: input.verified_on, owner_user_id: base.owner_user_id }, "re-verified");
}

/** For S2/P2 caller views: approved, non-stale items only. */
export function callerVisibleItems(items: FactItem[], now: Date, days: number): FactItem[] {
  return items.filter((i) => i.status === "approved" && !isStale(i.verified_on, now, days));
}
