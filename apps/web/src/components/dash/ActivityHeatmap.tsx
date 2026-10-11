/**
 * GitHub-style grid of approved calls per day, last 365 days. Columns are weeks, rows are weekdays
 * (Sunday on top). Days with fewer than five calls show as a light "some" tint, with no count, the
 * same suppression rule as the rest of the insights.
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/useApi";
import { useEffect, useMemo, useRef } from "react";

interface HeatDay { date: string; count: number | null; some: boolean }
interface Heatmap { from: string; to: string; total: { n: number } | { suppressed: true }; days: HeatDay[] }

/** Calm pastel greens, lightest (no calls) to deepest (busiest). */
const LEVELS = ["#eef0ec", "#e3efe4", "#bfdcc5", "#8fc49f", "#4f9a68"] as const;

function levelOf(d: HeatDay): number {
  if (d.count === null) return d.some ? 1 : 0;
  if (d.count < 10) return 2;
  if (d.count < 20) return 3;
  return 4;
}

function labelOf(d: HeatDay): string {
  const when = new Date(`${d.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (d.count !== null) return `${when}: ${d.count} call${d.count === 1 ? "" : "s"}`;
  return d.some ? `${when}: a few calls (hidden under 5)` : `${when}: no calls`;
}

export function ActivityHeatmap({ path, title = "Calling activity", description = "Approved calls per day over the last year, in UTC." }: { path: string; title?: string; description?: string }) {
  const { data, error, loading } = useApi<Heatmap>(path);
  const scroller = useRef<HTMLDivElement>(null);
  // Start at the most recent weeks, which sit at the right edge.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [data]);

  // Pad the start to a Sunday so each column is one calendar week.
  const weeks = useMemo(() => {
    if (!data) return [] as Array<Array<HeatDay | null>>;
    const first = new Date(`${data.days[0]!.date}T00:00:00Z`).getUTCDay();
    const cells: Array<HeatDay | null> = [...Array.from({ length: first }, () => null), ...data.days];
    const out: Array<Array<HeatDay | null>> = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [data]);

  // Month labels appear above the first week that starts in a new month.
  const monthLabels = useMemo(() => {
    const labels: Array<string | null> = [];
    let last = -1;
    weeks.forEach((week) => {
      const firstDay = week.find((c): c is HeatDay => !!c);
      const month = firstDay ? new Date(`${firstDay.date}T00:00:00Z`).getUTCMonth() : -1;
      labels.push(firstDay && month !== last ? new Date(`${firstDay.date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) : null);
      if (firstDay) last = month;
    });
    return labels;
  }, [weeks]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description} {data ? (data.total && "n" in data.total ? `${data.total.n} calls in this period.` : "Too few calls to show a total.") : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading && !data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {data ? (
          <div ref={scroller} className="overflow-x-auto pb-1">
            <div className="inline-flex flex-col gap-1">
              <div className="ml-7 flex gap-[3px] text-[10px] text-muted-foreground">
                {monthLabels.map((m, i) => (
                  <span key={i} className="w-[11px] shrink-0 whitespace-nowrap">{m ?? ""}</span>
                ))}
              </div>
              <div className="flex gap-[3px]">
                <div className="flex w-6 flex-col gap-[3px] pr-1 text-[10px] leading-[11px] text-muted-foreground">
                  <span />
                  <span>Mon</span>
                  <span />
                  <span>Wed</span>
                  <span />
                  <span>Fri</span>
                  <span />
                </div>
                {weeks.map((week, w) => (
                  <div key={w} className="flex flex-col gap-[3px]">
                    {Array.from({ length: 7 }, (_, r) => {
                      const cell = week[r] ?? null;
                      if (!cell) return <span key={r} className="size-[11px]" />;
                      return (
                        <span
                          key={r}
                          title={labelOf(cell)}
                          aria-label={labelOf(cell)}
                          className="size-[11px] rounded-[3px] transition-transform duration-150 hover:scale-125"
                          style={{ background: LEVELS[levelOf(cell)], outline: cell.some ? "1px dashed #8fc49f" : undefined }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
              Less
              {LEVELS.map((c) => <span key={c} className="size-[11px] rounded-[3px]" style={{ background: c }} />)}
              More
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
