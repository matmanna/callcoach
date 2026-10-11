import type { Tag, Turn } from "@sc/shared";

/** Deterministic placeholder-only draft: it never includes turn text. */
export function buildLabSummary(tags: readonly Tag[], turns: readonly Turn[]): string {
  const categories = [...new Set(tags)].slice(0, 8);
  const placeholder = categories.length ? categories.join(", ") : "no tagged categories";
  return `Draft from ${turns.length} scrubbed turns. Categories: ${placeholder}. Review and edit before approval.`.slice(0, 400);
}
