/**
 * Keyword search over approved fact items. Two backends, same result shape:
 *
 * - Atlas (ATLAS_SEARCH=1): Atlas Search `$search` on the `fact_text` index (infra/atlas/search-index-facts.json),
 *   fuzzy matching with one edit, and highlighted matches.
 * - Everywhere else (local Docker, tests): case-insensitive substring match. Atlas Search is not in the
 *   local mongo image, so this keeps dev working without pretending to be the same engine.
 *
 * Only approved versions are searched, the same facts callers can see. Results never include drafts.
 */
import { collections } from "../db/collections.ts";
import type { Deps } from "./context.ts";

export const FACT_SEARCH_INDEX = "fact_text";
export const MAX_QUERY_CHARS = 120;
export const MAX_RESULTS = 20;

export interface FactHit {
  sheet_id: string;
  item_id: string;
  text: string;
  source: string;
  verified_on: string;
  highlights: string[];
}

export const usesAtlasSearch = (env: NodeJS.ProcessEnv) => env.ATLAS_SEARCH === "1";

/** The `$search` pipeline. Exported so its shape is tested without an Atlas cluster. */
export function atlasSearchPipeline(orgId: string, query: string) {
  return [
    {
      $search: {
        index: FACT_SEARCH_INDEX,
        compound: {
          filter: [
            { equals: { path: "org_id", value: orgId } },
            { equals: { path: "status", value: "approved" } },
          ],
          must: [{ text: { query, path: ["text", "source"], fuzzy: { maxEdits: 1 } } }],
        },
        highlight: { path: "text" },
      },
    },
    { $limit: MAX_RESULTS },
    {
      $project: {
        _id: 0,
        sheet_id: 1,
        item_id: 1,
        text: 1,
        source: 1,
        verified_on: 1,
        highlights: { $meta: "searchHighlights" },
      },
    },
  ];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function searchFacts(deps: Deps, orgId: string, rawQuery: string): Promise<FactHit[]> {
  const query = rawQuery.trim().slice(0, MAX_QUERY_CHARS);
  if (!query) return [];
  const versions = collections(deps.db).fact_item_versions;

  if (usesAtlasSearch(deps.env)) {
    type Raw = Omit<FactHit, "highlights"> & { highlights?: Array<{ texts: Array<{ value: string; type: string }> }> };
    const rows = await versions.aggregate<Raw>(atlasSearchPipeline(orgId, query)).toArray();
    return rows.map((r) => ({
      sheet_id: r.sheet_id,
      item_id: r.item_id,
      text: r.text,
      source: r.source,
      verified_on: r.verified_on,
      highlights: (r.highlights ?? []).flatMap((h) => h.texts.filter((t) => t.type === "hit").map((t) => t.value)),
    }));
  }

  const re = new RegExp(escapeRegex(query), "i");
  const rows = await versions.find({ org_id: orgId, status: "approved", $or: [{ text: re }, { source: re }] }).sort({ verified_on: -1 }).limit(MAX_RESULTS).toArray();
  return rows.map((r) => ({
    sheet_id: r.sheet_id,
    item_id: r.item_id,
    text: r.text,
    source: r.source,
    verified_on: r.verified_on,
    highlights: [query],
  }));
}
