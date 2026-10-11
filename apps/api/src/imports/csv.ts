import Papa from "papaparse";
import { FORBIDDEN_IMPORT_COLUMN } from "@sc/shared";
import { HttpError } from "../http.ts";

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

export const MAX_IMPORT_BYTES = 2_000_000;

export function parseCsv(content: string): ParsedTable {
  const out = Papa.parse<Record<string, string>>(content.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  return { headers: (out.meta.fields ?? []).filter(Boolean), rows: out.data };
}

/** Raw call content never enters the system: refuse the whole file. Reports column names only. */
export function assertNoForbiddenColumns(headers: readonly string[]): void {
  const bad = headers.filter((h) => FORBIDDEN_IMPORT_COLUMN.test(h));
  if (bad.length) throw new HttpError(422, "forbidden_column", { columns: bad });
}

/** mapping: target column -> source header. Unmapped targets fall back to the same-named header. */
export function applyMapping(row: Record<string, string>, targets: readonly string[], mapping: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of targets) {
    const src = mapping[t] ?? t;
    const v = row[src];
    if (v !== undefined) out[t] = v;
  }
  return out;
}

/** Suggest a mapping by case- and punctuation-insensitive header match. */
export function suggestMapping(headers: readonly string[], targets: readonly string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out: Record<string, string> = {};
  for (const t of targets) {
    const h = headers.find((x) => norm(x) === norm(t));
    if (h) out[t] = h;
  }
  return out;
}

export function toCsv(headers: readonly string[], rows: readonly Record<string, string>[]): string {
  return Papa.unparse({ fields: [...headers], data: rows.map((r) => headers.map((h) => r[h] ?? "")) });
}
