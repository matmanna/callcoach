/**
 * One import code path for the coordinator site and `pnpm db:seed`.
 * Server-side Zod validation is the trust boundary; the browser preview is convenience.
 */
import {
  DONOR_COLUMNS,
  DonorCsvRow,
  FACT_COLUMNS,
  FactSheetImportRow,
  GIFT_COLUMNS,
  GiftCsvRow,
  RubricImportFile,
  type DonorDoc,
  type FactItem,
  type FactSheetDoc,
  type RejectedRow,
  type RubricDoc,
  type SeedKind,
  type SeedRunDoc,
} from "@sc/shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole, type Access } from "../auth/access.ts";
import { appendAudit } from "../db/audit.ts";
import { collections } from "../db/collections.ts";
import { HttpError } from "../http.ts";
import { nowOf, type Deps } from "../services/context.ts";
import { MAX_IMPORT_BYTES, applyMapping, assertNoForbiddenColumns, parseCsv, suggestMapping } from "./csv.ts";

export const ImportRequest = z.strictObject({
  file_name: z.string().trim().min(1).max(200),
  content: z.string().max(MAX_IMPORT_BYTES),
  mapping: z.record(z.string(), z.string()).optional(),
  update_existing: z.boolean().default(false),
  team_id: z.string().nullable().optional(),
  campaign_name: z.string().trim().max(120).optional(),
});
export type ImportRequest = z.infer<typeof ImportRequest>;

const TARGETS: Record<SeedKind, readonly string[]> = { donors: DONOR_COLUMNS, gifts: GIFT_COLUMNS, fact_sheet: FACT_COLUMNS, rubric: [] };
const MAX_STORED_REJECTS = 500;
const zodReasons = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`);

interface Table {
  headers: string[];
  rows: Record<string, string>[];
  json: unknown | null;
}

function readTable(kind: SeedKind, req: ImportRequest): Table {
  const looksJson = /\.json$/i.test(req.file_name) || /^\s*[[{]/.test(req.content);
  if (kind === "rubric") {
    if (!looksJson) throw new HttpError(422, "rubric_must_be_json");
    return { headers: [], rows: [], json: parseJson(req.content) };
  }
  if (kind === "fact_sheet" && looksJson) {
    const json = parseJson(req.content);
    const items = Array.isArray(json) ? json : (json as { items?: unknown })?.items;
    if (!Array.isArray(items)) throw new HttpError(422, "invalid_json", { hint: "expected an array or { items: [...] }" });
    const rows = items.map((it) => Object.fromEntries(Object.entries((it ?? {}) as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)])));
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    assertNoForbiddenColumns(headers);
    return { headers, rows, json: null };
  }
  const t = parseCsv(req.content);
  assertNoForbiddenColumns(t.headers);
  return { ...t, json: null };
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    throw new HttpError(422, "invalid_json");
  }
}

interface RowCheck<T> {
  row: number;
  values: Record<string, string>;
  ok: boolean;
  reasons: string[];
  parsed?: T;
  action?: "insert" | "update";
}

type DonorRow = z.infer<typeof DonorCsvRow>;
type GiftRow = z.infer<typeof GiftCsvRow>;
type FactRow = z.infer<typeof FactSheetImportRow>;

async function checkDonors(deps: Deps, access: Access, orgId: string, t: Table, req: ImportRequest): Promise<RowCheck<DonorRow & { team_id: string }>[]> {
  const c = collections(deps.db);
  const teams = await c.teams.find({ org_id: orgId, archived_at: null }).toArray();
  const teamByName = new Map(teams.map((tm) => [tm.name.toLowerCase(), tm]));
  const existing = new Set((await c.donors.find({ org_id: orgId }, { projection: { external_id: 1 } }).toArray()).map((d) => d.external_id));
  const seen = new Set<string>();
  return t.rows.map((raw, i) => {
    const values = applyMapping(raw, DONOR_COLUMNS, req.mapping);
    const r = DonorCsvRow.safeParse(values);
    const out: RowCheck<DonorRow & { team_id: string }> = { row: i + 1, values, ok: false, reasons: [] };
    if (!r.success) {
      out.reasons = zodReasons(r.error);
      return out;
    }
    const team = teamByName.get(r.data.team_name.toLowerCase());
    if (!team) out.reasons.push(`team_name: no team named "${r.data.team_name}" in this organization`);
    else {
      try {
        requireRole(access, team._id, "coordinator");
      } catch {
        out.reasons.push("team_name: you do not coordinate this team");
      }
    }
    if (seen.has(r.data.external_id)) out.reasons.push("external_id: duplicate in this file");
    seen.add(r.data.external_id);
    if (existing.has(r.data.external_id)) {
      if (req.update_existing) out.action = "update";
      else out.reasons.push('external_id: already exists (confirm "update existing" to update)');
    } else out.action = "insert";
    out.ok = out.reasons.length === 0;
    if (out.ok && team) out.parsed = { ...r.data, team_id: team._id };
    return out;
  });
}

async function checkGifts(deps: Deps, orgId: string, t: Table, req: ImportRequest): Promise<RowCheck<GiftRow & { donor_id: string }>[]> {
  const c = collections(deps.db);
  const donors = new Map((await c.donors.find({ org_id: orgId }, { projection: { external_id: 1 } }).toArray()).map((d) => [d.external_id, d._id]));
  const existing = new Set((await c.gifts.find({ org_id: orgId }, { projection: { external_id: 1 } }).toArray()).map((g) => g.external_id));
  const seen = new Set<string>();
  return t.rows.map((raw, i) => {
    const values = applyMapping(raw, GIFT_COLUMNS, req.mapping);
    const r = GiftCsvRow.safeParse(values);
    const out: RowCheck<GiftRow & { donor_id: string }> = { row: i + 1, values, ok: false, reasons: [] };
    if (!r.success) {
      out.reasons = zodReasons(r.error);
      return out;
    }
    const donorId = donors.get(r.data.donor_external_id);
    if (!donorId) out.reasons.push("donor_external_id: donor does not exist");
    if (seen.has(r.data.external_id)) out.reasons.push("external_id: duplicate in this file");
    seen.add(r.data.external_id);
    if (existing.has(r.data.external_id)) {
      if (req.update_existing) out.action = "update";
      else out.reasons.push('external_id: already exists (confirm "update existing" to update)');
    } else out.action = "insert";
    out.ok = out.reasons.length === 0;
    if (out.ok && donorId) out.parsed = { ...r.data, donor_id: donorId };
    return out;
  });
}

async function checkFacts(deps: Deps, access: Access, orgId: string, t: Table, req: ImportRequest): Promise<RowCheck<FactRow & { owner_user_id: string }>[]> {
  const c = collections(deps.db);
  const memberIds = new Set((await c.memberships.find({ org_id: orgId, status: "active" }).toArray()).map((m) => m.user_id));
  const emails = [...new Set(t.rows.map((r) => (applyMapping(r, FACT_COLUMNS, req.mapping).owner_email ?? "").toLowerCase()).filter(Boolean))];
  const users = await c.users.find({ email: { $in: emails } }).toArray();
  const ownerByEmail = new Map(users.filter((u) => memberIds.has(String(u._id))).map((u) => [u.email.toLowerCase(), String(u._id)]));
  return t.rows.map((raw, i) => {
    const values = applyMapping(raw, FACT_COLUMNS, req.mapping);
    const cleaned = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
    const r = FactSheetImportRow.safeParse(cleaned);
    const out: RowCheck<FactRow & { owner_user_id: string }> = { row: i + 1, values, ok: false, reasons: [], action: "insert" };
    if (!r.success) {
      out.reasons = zodReasons(r.error);
      return out;
    }
    let owner = access.user.id;
    if (r.data.owner_email) {
      const o = ownerByEmail.get(r.data.owner_email.toLowerCase());
      if (!o) out.reasons.push("owner_email: not a member of this organization");
      else owner = o;
    }
    out.ok = out.reasons.length === 0;
    if (out.ok) out.parsed = { ...r.data, owner_user_id: owner };
    return out;
  });
}

function checkRubric(t: Table): RowCheck<z.infer<typeof RubricImportFile>>[] {
  const r = RubricImportFile.safeParse(t.json);
  const count = Array.isArray((t.json as { items?: unknown[] })?.items) ? (t.json as { items: unknown[] }).items.length : 0;
  if (r.success) return [{ row: 1, values: { items: String(r.data.items.length) }, ok: true, reasons: [], parsed: r.data, action: "insert" }];
  return [{ row: 1, values: { items: String(count) }, ok: false, reasons: zodReasons(r.error) }];
}

async function check(deps: Deps, access: Access, orgId: string, kind: SeedKind, req: ImportRequest, t: Table): Promise<RowCheck<unknown>[]> {
  switch (kind) {
    case "donors":
      return checkDonors(deps, access, orgId, t, req);
    case "gifts":
      return checkGifts(deps, orgId, t, req);
    case "fact_sheet":
      return checkFacts(deps, access, orgId, t, req);
    case "rubric":
      return checkRubric(t);
  }
}

export interface PreviewResult {
  kind: SeedKind;
  headers: string[];
  targets: readonly string[];
  suggested_mapping: Record<string, string>;
  missing_columns: string[];
  total_rows: number;
  valid_rows: number;
  rows: Array<{ row: number; values: Record<string, string>; ok: boolean; reasons: string[]; action?: "insert" | "update" }>;
}

export async function previewImport(deps: Deps, access: Access, orgId: string, kind: SeedKind, req: ImportRequest): Promise<PreviewResult> {
  const t = readTable(kind, req);
  const targets = TARGETS[kind];
  const suggested = { ...suggestMapping(t.headers, targets), ...(req.mapping ?? {}) };
  const checks = await check(deps, access, orgId, kind, { ...req, mapping: suggested }, t);
  return {
    kind,
    headers: t.headers,
    targets,
    suggested_mapping: suggested,
    missing_columns: targets.filter((x) => !suggested[x] && !t.headers.includes(x)),
    total_rows: checks.length,
    valid_rows: checks.filter((r) => r.ok).length,
    rows: checks.slice(0, 20).map(({ parsed: _p, ...rest }) => rest),
  };
}

export interface CommitResult {
  seed_run: SeedRunDoc;
}

export async function commitImport(deps: Deps, access: Access, orgId: string, kind: SeedKind, req: ImportRequest): Promise<CommitResult> {
  const c = collections(deps.db);
  const now = nowOf(deps);
  const run: SeedRunDoc = {
    _id: randomUUID(),
    org_id: orgId,
    kind,
    file_name: req.file_name,
    row_count: 0,
    accepted_count: 0,
    updated_count: 0,
    rejected_count: 0,
    rejected_rows: [],
    created_by: access.user.id,
    created_at: now,
    status: "completed",
  };
  let t: Table;
  try {
    t = readTable(kind, req);
  } catch (err) {
    // Record the refusal (no row contents) so every import attempt is auditable.
    run.status = "failed";
    await c.seed_runs.insertOne(run);
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: `import.${kind}.refused`, target_type: "seed_run", target_id: run._id, note: err instanceof HttpError ? err.code : "error" });
    throw err;
  }
  const mapping = { ...suggestMapping(t.headers, TARGETS[kind]), ...(req.mapping ?? {}) };
  const checks = await check(deps, access, orgId, kind, { ...req, mapping }, t);
  run.row_count = checks.length;
  const rejected: RejectedRow[] = checks.filter((r) => !r.ok).map((r) => ({ row: r.row, reasons: r.reasons, values: r.values }));
  run.rejected_count = rejected.length;
  run.rejected_rows = rejected.slice(0, MAX_STORED_REJECTS);
  const ok = checks.filter((r) => r.ok && r.parsed);

  if (kind === "donors") {
    for (const r of ok as RowCheck<DonorRow & { team_id: string }>[]) {
      const p = r.parsed!;
      await c.campaigns.updateOne({ org_id: orgId, name: p.campaign }, { $setOnInsert: { _id: randomUUID(), description: "", fact_sheet_ids: [] } }, { upsert: true });
      const fields = {
        first_name: p.first_name,
        last_name: p.last_name,
        spouse_name: p.spouse_name,
        employer: p.employer,
        town: p.town,
        campaign: p.campaign,
        gift_band: p.gift_band,
        past_gift_count: p.past_gift_count,
        last_gift_band: p.last_gift_band,
        limits: p.limits,
        updated_at: now,
      };
      if (r.action === "update") {
        await c.donors.updateOne({ org_id: orgId, external_id: p.external_id }, { $set: fields, $addToSet: { team_ids: p.team_id } });
        run.updated_count++;
      } else {
        const doc: DonorDoc = { _id: randomUUID(), org_id: orgId, external_id: p.external_id, team_ids: [p.team_id], timezone_hint: null, created_at: now, ...fields };
        await c.donors.insertOne(doc);
        run.accepted_count++;
      }
    }
  } else if (kind === "gifts") {
    for (const r of ok as RowCheck<GiftRow & { donor_id: string }>[]) {
      const p = r.parsed!;
      const fields = { donor_id: p.donor_id, amount_band: p.amount_band, campaign: p.campaign, gift_date: new Date(`${p.gift_date}T00:00:00Z`) };
      if (r.action === "update") {
        await c.gifts.updateOne({ org_id: orgId, external_id: p.external_id }, { $set: fields });
        run.updated_count++;
      } else {
        await c.gifts.insertOne({ _id: randomUUID(), org_id: orgId, external_id: p.external_id, ...fields });
        run.accepted_count++;
      }
    }
  } else if (kind === "fact_sheet") {
    const items: FactItem[] = (ok as RowCheck<FactRow & { owner_user_id: string }>[]).map((r) => ({
      id: randomUUID(),
      text: r.parsed!.text,
      source: r.parsed!.source,
      verified_on: r.parsed!.verified_on,
      owner_user_id: r.parsed!.owner_user_id,
      status: "draft",
    }));
    if (items.length) {
      const sheet: FactSheetDoc = { _id: randomUUID(), org_id: orgId, name: req.file_name, items, created_at: now };
      await c.fact_sheets.insertOne(sheet);
      if (req.campaign_name) {
        await c.campaigns.updateOne(
          { org_id: orgId, name: req.campaign_name },
          { $setOnInsert: { _id: randomUUID(), description: "" }, $addToSet: { fact_sheet_ids: sheet._id } },
          { upsert: true },
        );
      }
      run.accepted_count = items.length;
    }
  } else {
    const teamId = req.team_id ?? null;
    if (teamId) requireRole(access, teamId, "coordinator");
    const r = ok[0] as RowCheck<z.infer<typeof RubricImportFile>> | undefined;
    if (r?.parsed) {
      const doc: RubricDoc = {
        _id: randomUUID(),
        org_id: orgId,
        team_id: teamId,
        items: r.parsed.items.map((it) => ({ ...it, conditional_on_tag: it.conditional_on_tag ?? null })),
        created_at: now,
      };
      await c.rubrics.insertOne(doc);
      run.accepted_count = 1;
    }
  }

  await c.seed_runs.insertOne(run);
  await appendAudit(deps.db, {
    org_id: orgId,
    who: access.user.id,
    action: `import.${kind}`,
    target_type: "seed_run",
    target_id: run._id,
    note: `accepted ${run.accepted_count}, updated ${run.updated_count}, rejected ${run.rejected_count}`,
  });
  return { seed_run: run };
}
