/** Rubric versions, knowledge entries, handoff packets, patterns. */
import type { HandoffPacketDoc, KnowledgeEntryDoc, PatternDoc, RubricVersionDoc } from "@sc/shared";
import { randomUUID } from "node:crypto";
import { requireRole, type Access } from "../../auth/access.ts";
import { appendAudit } from "../../db/audit.ts";
import { collections } from "../../db/collections.ts";
import { withTx } from "../../db/tx.ts";
import { HttpError, notFound } from "../../http.ts";
import { nowOf, type Deps } from "../context.ts";
import { factWarnings } from "./facts.ts";
import { p2 } from "./p2Docs.ts";
import type { Scope } from "./scope.ts";
import { displayNames } from "./util.ts";

// ---------- rubrics ----------
export async function ensureRubricVersion(deps: Deps, rubricId: string, orgId: string) {
  const c = collections(deps.db);
  const rubric = await c.rubrics.findOne({ _id: rubricId, org_id: orgId });
  if (!rubric) throw notFound();
  const have = await c.rubric_versions.findOne({ org_id: orgId, rubric_id: rubricId });
  if (!have) {
    try {
      await c.rubric_versions.insertOne({
        _id: randomUUID(),
        org_id: orgId,
        rubric_id: rubricId,
        version: rubric.version ?? 1,
        items: rubric.items.map((i) => ({ ...i, conditional_on_tag: i.conditional_on_tag ?? null })),
        note: "initial",
        created_by: rubric.items.length ? "system" : "system",
        created_at: rubric.created_at,
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  return rubric;
}

export async function updateRubric(deps: Deps, access: Access, orgId: string, rubricId: string, input: { items: RubricVersionDoc["items"]; note?: string | undefined }) {
  const c = collections(deps.db);
  const rubric = await ensureRubricVersion(deps, rubricId, orgId);
  if (rubric.team_id) requireRole(access, rubric.team_id, "coordinator");
  const latest = await c.rubric_versions.find({ org_id: orgId, rubric_id: rubricId }).sort({ version: -1 }).limit(1).next();
  const version = (latest?.version ?? 1) + 1;
  const items = input.items.map((i) => ({ ...i, conditional_on_tag: i.conditional_on_tag ?? null }));
  await withTx(deps.client, async (session) => {
    await c.rubric_versions.insertOne({ _id: randomUUID(), org_id: orgId, rubric_id: rubricId, version, items, note: input.note ?? null, created_by: access.user.id, created_at: nowOf(deps) }, { session });
    await c.rubrics.updateOne({ _id: rubricId, org_id: orgId }, { $set: { items, version } }, { session });
    await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: "rubric.update", target_type: "rubric", target_id: rubricId, note: `v${version}` }, session);
  });
  return { version };
}

/** Which logs were evaluated against which version, from rubric_results (written by the post-call tier). */
export async function rubricVersions(deps: Deps, orgId: string, rubricId: string) {
  await ensureRubricVersion(deps, rubricId, orgId);
  const c = collections(deps.db);
  const versions = await c.rubric_versions.find({ org_id: orgId, rubric_id: rubricId }).sort({ version: -1 }).toArray();
  const results = deps.db.collection<{ call_id: string; rubric_id?: string; rubric_version?: number }>("rubric_results");
  const counts = await results.aggregate<{ _id: number; n: number }>([{ $match: { rubric_id: rubricId } }, { $group: { _id: "$rubric_version", calls: { $addToSet: "$call_id" } } }, { $project: { n: { $size: "$calls" } } }]).toArray();
  const byVersion = new Map(counts.map((r) => [r._id, r.n]));
  const names = await displayNames(deps, versions.map((v) => v.created_by));
  return {
    versions: versions.map((v) => ({ version: v.version, items: v.items, note: v.note, created_at: v.created_at, created_by: names.get(v.created_by) ?? "system", logs_evaluated: byVersion.get(v.version) ?? 0 })),
  };
}

// ---------- knowledge entries ----------
const knowledgeScope = (scope: Scope) => ({ org_id: scope.orgId, $or: [{ team_id: null }, { team_id: { $in: scope.teamIds } }] });

export async function listEntries(deps: Deps, scope: Scope, status?: string) {
  const rows = await collections(deps.db)
    .knowledge_entries.find({ ...knowledgeScope(scope), ...(status ? { status: status as KnowledgeEntryDoc["status"] } : {}) })
    .sort({ updated_at: -1 })
    .toArray();
  const names = await displayNames(deps, rows.map((r) => r.created_by));
  return { entries: rows.map((r) => ({ ...r, author: names.get(r.created_by) ?? "" })) };
}

export async function createEntry(deps: Deps, scope: Scope, access: Access, input: { type: KnowledgeEntryDoc["type"]; title: string; body: string; team_id?: string | null | undefined }) {
  const teamId = input.team_id ?? scope.teamId ?? null;
  if (teamId) requireRole(access, teamId, "coordinator");
  const warnings = await factWarnings(deps, scope.orgId, `${input.title}\n${input.body}`);
  const now = nowOf(deps);
  const doc: KnowledgeEntryDoc = { _id: randomUUID(), org_id: scope.orgId, team_id: teamId, type: input.type, title: input.title, body: input.body, status: "draft", version: 1, created_by: access.user.id, created_at: now, updated_at: now, published_by: null, published_at: null };
  await collections(deps.db).knowledge_entries.insertOne(doc);
  await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: "knowledge.create", target_type: "knowledge_entry", target_id: doc._id });
  return { entry: doc, warnings };
}

export async function updateEntry(deps: Deps, scope: Scope, access: Access, id: string, patch: { title?: string | undefined; body?: string | undefined }) {
  const c = collections(deps.db);
  const e = await c.knowledge_entries.findOne({ _id: id, ...knowledgeScope(scope) });
  if (!e) throw notFound();
  if (e.team_id) requireRole(access, e.team_id, "coordinator");
  // Editing a published entry returns it to draft until it is published again.
  const set = { ...(patch.title ? { title: patch.title } : {}), ...(patch.body ? { body: patch.body } : {}), status: "draft" as const, version: e.version + 1, updated_at: nowOf(deps), published_by: null, published_at: null };
  await c.knowledge_entries.updateOne({ _id: id }, { $set: set });
  await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: "knowledge.update", target_type: "knowledge_entry", target_id: id, note: `v${set.version}` });
  const warnings = await factWarnings(deps, scope.orgId, `${patch.title ?? e.title}\n${patch.body ?? e.body}`);
  return { version: set.version, warnings };
}

export async function publishEntry(deps: Deps, scope: Scope, access: Access, id: string) {
  const c = collections(deps.db);
  const e = await c.knowledge_entries.findOne({ _id: id, ...knowledgeScope(scope) });
  if (!e) throw notFound();
  if (e.team_id) requireRole(access, e.team_id, "coordinator");
  if (e.status === "published") return { status: "published" as const };
  const warnings = await factWarnings(deps, scope.orgId, `${e.title}\n${e.body}`);
  if (warnings.length) throw new HttpError(422, "donor_specific_content", { warnings });
  const now = nowOf(deps);
  await withTx(deps.client, async (session) => {
    await c.knowledge_entries.updateOne({ _id: id }, { $set: { status: "published", published_by: access.user.id, published_at: now, updated_at: now } }, { session });
    await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: "knowledge.publish", target_type: "knowledge_entry", target_id: id, note: `v${e.version}` }, session);
  });
  return { status: "published" as const };
}

export async function retireEntry(deps: Deps, scope: Scope, access: Access, id: string) {
  const c = collections(deps.db);
  const e = await c.knowledge_entries.findOne({ _id: id, ...knowledgeScope(scope) });
  if (!e) throw notFound();
  if (e.team_id) requireRole(access, e.team_id, "coordinator");
  await c.knowledge_entries.updateOne({ _id: id }, { $set: { status: "retired", updated_at: nowOf(deps) } });
  await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: "knowledge.retire", target_type: "knowledge_entry", target_id: id });
  return { status: "retired" as const };
}

// ---------- handoff packets ----------
export async function createHandoff(deps: Deps, scope: Scope, access: Access, input: { team_id: string; to_user_id: string; note: string; follow_up_ids: string[]; entry_ids: string[] }) {
  const c = collections(deps.db);
  const team = requireRole(access, input.team_id, "coordinator");
  if (!scope.teamIds.includes(team._id)) throw notFound();
  const to = await c.memberships.findOne({ org_id: scope.orgId, user_id: input.to_user_id, role: "coordinator", status: "active" });
  if (!to) throw new HttpError(422, "recipient_not_a_coordinator");
  if (input.to_user_id === access.user.id) throw new HttpError(422, "cannot_hand_off_to_self");
  const fus = await p2(deps.db).follow_ups.find({ _id: { $in: input.follow_up_ids }, org_id: scope.orgId, team_id: { $in: scope.teamIds }, status: "open" }).toArray();
  const entries = await c.knowledge_entries.find({ _id: { $in: input.entry_ids }, ...knowledgeScope(scope), status: "published" }).toArray();
  if (fus.length !== new Set(input.follow_up_ids).size || entries.length !== new Set(input.entry_ids).size) throw notFound();
  const packet: HandoffPacketDoc = {
    _id: randomUUID(),
    org_id: scope.orgId,
    team_id: team._id,
    from_user_id: access.user.id,
    to_user_id: input.to_user_id,
    note: input.note,
    items: [
      ...fus.map((f) => ({ id: randomUUID(), kind: "follow_up" as const, ref_id: f._id, label: f.action.slice(0, 200), acknowledged_at: null })),
      ...entries.map((e) => ({ id: randomUUID(), kind: "entry" as const, ref_id: e._id, label: e.title.slice(0, 200), acknowledged_at: null })),
    ],
    status: "open",
    created_at: nowOf(deps),
    acknowledged_at: null,
  };
  await c.handoff_packets.insertOne(packet);
  await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: "handoff.create", target_type: "handoff_packet", target_id: packet._id, note: `${packet.items.length} items` });
  // Not sent anywhere automatically: the recipient sees it in their list.
  return { packet };
}

export async function listHandoffs(deps: Deps, scope: Scope, access: Access) {
  const rows = await collections(deps.db).handoff_packets.find({ org_id: scope.orgId, team_id: { $in: scope.teamIds }, $or: [{ from_user_id: access.user.id }, { to_user_id: access.user.id }] }).sort({ created_at: -1 }).toArray();
  const names = await displayNames(deps, rows.flatMap((r) => [r.from_user_id, r.to_user_id]));
  return {
    packets: rows.map((r) => ({
      ...r,
      from: names.get(r.from_user_id) ?? "",
      to: names.get(r.to_user_id) ?? "",
      direction: r.to_user_id === access.user.id ? "incoming" : "outgoing",
      team: scope.teams.get(r.team_id)?.name ?? "",
    })),
  };
}

export async function acknowledgeItem(deps: Deps, scope: Scope, access: Access, packetId: string, itemId: string) {
  const c = collections(deps.db);
  const p = await c.handoff_packets.findOne({ _id: packetId, org_id: scope.orgId, team_id: { $in: scope.teamIds } });
  if (!p || p.to_user_id !== access.user.id) throw notFound();
  if (!p.items.some((i) => i.id === itemId)) throw notFound();
  const now = nowOf(deps);
  await c.handoff_packets.updateOne({ _id: packetId, "items.id": itemId, "items.acknowledged_at": null }, { $set: { "items.$.acknowledged_at": now } });
  const after = await c.handoff_packets.findOne({ _id: packetId });
  const done = !!after && after.items.every((i) => i.acknowledged_at);
  if (done && after!.status !== "acknowledged") {
    await c.handoff_packets.updateOne({ _id: packetId }, { $set: { status: "acknowledged", acknowledged_at: now } });
    await appendAudit(deps.db, { org_id: scope.orgId, who: access.user.id, action: "handoff.acknowledge", target_type: "handoff_packet", target_id: packetId });
  }
  return { acknowledged: true, packet_complete: done };
}

// ---------- shared patterns ----------
export async function listPatterns(deps: Deps, orgId: string, status?: string) {
  const rows = await collections(deps.db).patterns.find({ org_id: orgId, ...(status ? { status: status as PatternDoc["status"] } : {}) }).sort({ created_at: -1 }).toArray();
  // Patterns are generic and never linked to donors: only these fields leave the API.
  return { patterns: rows.map((p) => ({ id: p._id, title: p.title, description: p.description, segment: p.segment, denominator: p.denominator, date_from: p.date_from, date_to: p.date_to, status: p.status })) };
}

export async function decidePattern(deps: Deps, orgId: string, access: Access, id: string, action: "approve" | "retire") {
  const c = collections(deps.db);
  const p = await c.patterns.findOne({ _id: id, org_id: orgId });
  if (!p) throw notFound();
  const status = action === "approve" ? "approved" : "retired";
  await c.patterns.updateOne({ _id: id }, { $set: { status, decided_by: access.user.id, decided_at: nowOf(deps) } });
  await appendAudit(deps.db, { org_id: orgId, who: access.user.id, action: `pattern.${action}`, target_type: "pattern", target_id: id });
  return { id, status };
}
