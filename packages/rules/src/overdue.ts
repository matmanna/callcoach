/** Compare ISO calendar dates in the team's IANA timezone. `now` is injected. */
export function isOverdue(dueDate: string | null, now: Date, timezone: string): boolean {
  if (!dueDate) return false;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return dueDate < `${get("year")}-${get("month")}-${get("day")}`;
}
