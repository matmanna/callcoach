/**
 * Organization context for Bedrock: the approved fact sheet items and the mission. Built from
 * approved fact versions only. Never includes call content, notes, or donor records.
 */
import { collections } from "../db/collections.ts";
import { isStale, staleDays } from "./dashboard/facts.ts";
import { nowOf, type Deps } from "./context.ts";

export const MAX_CONTEXT_FACTS = 25;
export const MAX_CONTEXT_FACT_CHARS = 500;

export interface ContextFact {
  text: string;
  source: string;
  verified_on: string;
}

export interface OrgModelContext {
  mission: string | null;
  facts: ContextFact[];
}

/** Latest approved version of each item, skipping stale ones (the same rule callers see). */
export async function orgModelContext(deps: Deps, orgId: string): Promise<OrgModelContext> {
  const c = collections(deps.db);
  const org = await c.organizations.findOne({ _id: orgId }, { projection: { mission: 1 } });
  const approved = await c.fact_item_versions.find({ org_id: orgId, status: "approved" }).sort({ version: 1 }).toArray();
  const latest = new Map<string, (typeof approved)[number]>();
  for (const v of approved) latest.set(`${v.sheet_id}:${v.item_id}`, v);
  const now = nowOf(deps);
  const days = staleDays(deps);
  const facts = [...latest.values()]
    .filter((v) => !isStale(v.verified_on, now, days))
    .slice(0, MAX_CONTEXT_FACTS)
    .map((v) => ({ text: v.text.slice(0, MAX_CONTEXT_FACT_CHARS), source: v.source, verified_on: v.verified_on }));
  return { mission: org?.mission ?? null, facts };
}

/** Plain text block appended to the system prompt. Empty when the organization has no approved facts or mission. */
export function renderOrgContext(ctx: OrgModelContext | undefined): string {
  if (!ctx || (!ctx.facts.length && !ctx.mission)) return "";
  const lines = [
    "Organization context. The nonprofit approved these facts. Use them only as background. Do not add facts that are not listed here.",
  ];
  if (ctx.mission) lines.push(`Mission: ${ctx.mission}`);
  for (const f of ctx.facts) lines.push(`- ${f.text} (Source: ${f.source}; verified ${f.verified_on})`);
  return lines.join("\n");
}
