import { collections } from "../../db/collections.ts";
import { toUserKey } from "../orgs.ts";
import type { Deps } from "../context.ts";

/** Today's date (YYYY-MM-DD) in an IANA zone; missing or bad zones fall back to UTC. */
export function todayIn(timezone: string | null | undefined, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export async function displayNames(deps: Deps, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const users = await collections(deps.db).users.find({ _id: { $in: unique.map(toUserKey) } }).toArray();
  return new Map(users.map((u) => [String(u._id), u.display_name ?? u.name]));
}
