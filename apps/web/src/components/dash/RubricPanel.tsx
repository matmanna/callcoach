/**
 * Rubric display, shared by the post-call form, the call review, and both profile views.
 * Every status says what it means in words, so a volunteer and a coordinator read the same thing.
 * Results are suggestions from the call log. "Not captured" means the log cannot show it. It is not a miss.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { evaluateRubric, rubricScore, type RubricResult } from "@sc/rules";
import type { LogFields } from "@sc/shared";
import { CircleHelp, Minus, X, Check, type LucideIcon } from "lucide-react";
import { CellText, type Cell } from "./bits";

export interface RubricItem {
  id: string;
  text: string;
  supporting_tags: string[];
  conditional_on_tag?: string | null;
  weight?: number;
}

/** Plain words and colors for each status. Same pastel family as onboarding. */
export const RUBRIC_STATUS: Record<RubricResult["status"], { label: string; help: string; tint: string; ink: string; Icon: LucideIcon }> = {
  met: { label: "Met", help: "The log shows this happened.", tint: "#dff3e4", ink: "#3f7a52", Icon: Check },
  not_met: { label: "Not met", help: "The log shows this did not happen.", tint: "#fbe3e0", ink: "#a4493b", Icon: X },
  unknown: { label: "Not captured", help: "The call log cannot show this. It is not counted either way.", tint: "#fbf1d4", ink: "#8a6d1a", Icon: CircleHelp },
  n_a: { label: "Doesn't apply", help: "The moment did not come up on this call.", tint: "#eef0f2", ink: "#5a6570", Icon: Minus },
};

/** Coordinator-side rubric (team null). Null when the organization has not set one yet. */
export function useOrgRubric(): RubricItem[] | null {
  const { data } = useApi<{ rubrics: Array<{ team_id: string | null; items: RubricItem[] }> }>("/rubrics");
  return data?.rubrics.find((r) => r.team_id === null)?.items ?? null;
}

export function RubricLegend() {
  return (
    <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
      {(Object.keys(RUBRIC_STATUS) as Array<RubricResult["status"]>).map((s) => (
        <li key={s} className="flex items-start gap-2">
          <StatusChip status={s} />
          <span>{RUBRIC_STATUS[s].help}</span>
        </li>
      ))}
    </ul>
  );
}

export function StatusChip({ status }: { status: RubricResult["status"] }) {
  const s = RUBRIC_STATUS[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: s.tint, color: s.ink }}>
      <s.Icon className="size-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** One call scored against the rubric. Works on a draft (post-call) or an approved log (review). */
export function CallRubric({ items, fields, title = "Rubric for this call" }: { items: RubricItem[] | null; fields: LogFields | null; title?: string }) {
  if (!items || !fields) {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">No rubric is set for this organization yet. A coordinator sets one under Knowledge, then Rubrics.</CardContent>
      </Card>
    );
  }
  const results = evaluateRubric(items, fields);
  const score = rubricScore(results);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          {title}
          {score.percent !== null ? (
            <Badge className="text-sm" style={{ background: RUBRIC_STATUS.met.tint, color: RUBRIC_STATUS.met.ink }}>Score {score.percent}%</Badge>
          ) : (
            <Badge variant="outline">Not enough to score yet</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {score.percent !== null
            ? `${score.evaluated} weighted item${score.evaluated === 1 ? "" : "s"} could be checked from the log. Weight shows how much each item counts. Suggested by rules, needs review.`
            : "Nothing on this call could be checked from the log. Items marked Not captured are not counted."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id} className="rounded-xl border p-3" style={{ borderColor: RUBRIC_STATUS[r.status].tint }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{r.text}</span>
                <span className="flex items-center gap-2">
                  {r.weight !== 1 ? <Badge variant="outline" className="text-xs">weight {r.weight}</Badge> : null}
                  <StatusChip status={r.status} />
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.basis}</p>
            </li>
          ))}
        </ul>
        <RubricLegend />
      </CardContent>
    </Card>
  );
}

interface Breakdown {
  rubric: boolean;
  calls: Cell;
  scored_calls: Cell;
  mean_percent: number | { suppressed: true };
  items: Array<{ id: string; text: string; weight: number; met: Cell; not_met: Cell; unknown: Cell; n_a: Cell }>;
}

/** A volunteer's rubric results across their approved calls. Counts under 5 are suppressed on the server. */
export function RubricBreakdown({ path, title = "Rubric results" }: { path: string; title?: string }) {
  const { data, error, loading } = useApi<Breakdown>(path);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          {title}
          {data && typeof data.mean_percent === "number" ? <Badge style={{ background: RUBRIC_STATUS.met.tint, color: RUBRIC_STATUS.met.ink }}>Average score {data.mean_percent}%</Badge> : null}
        </CardTitle>
        <CardDescription>
          Counts from approved calls only, checked against the call log. Suggested by rules, needs review. Small counts are hidden.
          Warmth ratings are not part of this.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {loading && !data ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {data && !data.rubric ? <p className="text-sm text-muted-foreground">No rubric is set for this organization yet.</p> : null}
        {data?.rubric ? (
          <>
            <p className="text-sm">
              Calls: <CellText cell={data.calls} /> · Calls with a score: <CellText cell={data.scored_calls} />
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Met</TableHead>
                  <TableHead>Not met</TableHead>
                  <TableHead>Not captured</TableHead>
                  <TableHead>Doesn't apply</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      {i.text} {i.weight !== 1 ? <span className="text-xs text-muted-foreground">(weight {i.weight})</span> : null}
                    </TableCell>
                    <TableCell><CellText cell={i.met} /></TableCell>
                    <TableCell><CellText cell={i.not_met} /></TableCell>
                    <TableCell><CellText cell={i.unknown} /></TableCell>
                    <TableCell><CellText cell={i.n_a} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <RubricLegend />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
