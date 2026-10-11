/**
 * Onboarding steps that go beyond the profile: the organization's own fact sheet and rubric weights.
 * Both reuse the import and rubric code paths the coordinator site already uses.
 */
import type { RubricUpdate } from "@sc/shared";
import type { z } from "zod";
import type { Access } from "../auth/access.ts";
import { collections } from "../db/collections.ts";
import { HttpError } from "../http.ts";
import { ImportRequest, commitImport } from "../imports/importer.ts";
import type { Deps } from "./context.ts";
import { approveVersion, factWarnings, loadSheet } from "./dashboard/facts.ts";
import { updateRubric } from "./dashboard/knowledge.ts";

export const FACT_UPLOAD_NOTE = "onboarding upload";

/**
 * Imports the organization's fact sheet (CSV or JSON, same columns as Imports) and approves every
 * item. The coordinator uploading it is the approver, as with the sample data, and the audit log records it.
 */
export async function uploadOnboardingFactSheet(deps: Deps, access: Access, orgId: string, req: ImportRequest) {
  // Checked on the whole file before anything is stored, so a rejected upload leaves nothing behind.
  const warnings = await factWarnings(deps, orgId, req.content);
  if (warnings.length) throw new HttpError(422, "donor_specific_content", { warnings });
  const { seed_run } = await commitImport(deps, access, orgId, "fact_sheet", req);
  if (seed_run.accepted_count === 0) throw new HttpError(422, "no_valid_facts", { rejected: seed_run.rejected_rows.length });
  const c = collections(deps.db);
  const sheet = await c.fact_sheets.findOne({ org_id: orgId, name: req.file_name }, { sort: { created_at: -1 } });
  if (!sheet) throw new HttpError(422, "fact_sheet_not_found");
  await loadSheet(deps, orgId, sheet._id);
  let approved = 0;
  for (const item of sheet.items) {
    await approveVersion(deps, access, orgId, sheet._id, item.id, 1, FACT_UPLOAD_NOTE);
    approved += 1;
  }
  return {
    fact_sheet_id: sheet._id,
    accepted: seed_run.accepted_count,
    approved,
    rejected: seed_run.rejected_rows.slice(0, 50),
  };
}

/**
 * Sets the organization rubric's weights. Changing an existing rubric makes a new version, like the
 * Rubrics page. With no organization rubric yet, the items become the first one.
 */
export async function setOrgRubricWeights(deps: Deps, access: Access, orgId: string, input: z.infer<typeof RubricUpdate>) {
  const items = input.items.map((i) => ({ ...i, conditional_on_tag: i.conditional_on_tag ?? null }));
  const existing = await collections(deps.db).rubrics.findOne({ org_id: orgId, team_id: null });
  if (existing) return updateRubric(deps, access, orgId, existing._id, { items, ...(input.note ? { note: input.note } : {}) });
  const { seed_run } = await commitImport(deps, access, orgId, "rubric", {
    file_name: "onboarding-rubric.json",
    content: JSON.stringify({ items }),
    update_existing: false,
    team_id: null,
  });
  if (seed_run.accepted_count === 0) throw new HttpError(422, "invalid_rubric", { rejected: seed_run.rejected_rows.length });
  return { version: 1 };
}
