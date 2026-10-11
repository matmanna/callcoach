import { CellText, DonorMix, LoadState, PageHeader, RangeNote, cellValue, type Cell } from "@/components/dash/bits";
import { SeriesChart } from "@/components/dash/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";

interface Res {
  range: { from: string; to: string };
  denominator: { what: string; count: Cell };
  donor_mix: Record<"first_time" | "lapsed" | "recent", Cell>;
  note: string;
  level: string;
  regions: Array<{ region: string; donors_called: Cell; follow_ups: Cell }>;
  team_coverage: Array<{ team_id: string; team: string; regions: Array<{ region: string; donors_called: Cell }> }>;
}

/** Region-level only. No pins, no street-level points, and no coordinates are stored for donors. */
export function GeographyPage() {
  const scope = useTeamScope();
  // Unset until the coordinator picks one: the server then uses the default from volunteers' service scope.
  const [chosen, setChosen] = useState<string | null>(null);
  const { data, error, loading } = useApi<Res & { suggested_level: string; scope_mix: Record<"local" | "national" | "global" | "unset", Cell> }>(withQuery("/insights/map", chosen ? `level=${chosen}` : "", scope.q));
  const level = data?.level ?? "region";
  return (
    <>
      <PageHeader title="Geography" description="Donors called and follow-ups, by region. Regions with fewer than 5 are suppressed." actions={<Select value={level} onValueChange={setChosen}><SelectTrigger className="w-40" aria-label="Level"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="region">State or region</SelectItem><SelectItem value="country">Country</SelectItem></SelectContent></Select>} />
      <LoadState loading={loading} error={error}>
        {data ? (
          <div className="space-y-4">
            {data.scope_mix ? (
              <p className="text-sm text-muted-foreground">
                {chosen ? "Level chosen here." : `Default: ${data.suggested_level === "region" ? "state or region" : "country"}, from volunteers' service scope`}
                {" · "}local <CellText cell={data.scope_mix.local} />, national <CellText cell={data.scope_mix.national} />, global <CellText cell={data.scope_mix.global} />, not yet answered <CellText cell={data.scope_mix.unset} />.
              </p>
            ) : null}
            <Card>
              <CardHeader><CardTitle>Regional table</CardTitle><CardDescription>Donors called and follow-ups created, by {level === "country" ? "country" : "state or region"}.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <SeriesChart x="region" data={data.regions.map((r) => ({ region: r.region, "Donors called": cellValue(r.donors_called), "Follow-ups": cellValue(r.follow_ups) }))} series={[{ key: "Donors called", label: "Donors called" }, { key: "Follow-ups", label: "Follow-ups" }]} />
                <Table>
                  <TableHeader><TableRow><TableHead>Region</TableHead><TableHead>Donors called</TableHead><TableHead>Follow-ups</TableHead></TableRow></TableHeader>
                  <TableBody>{data.regions.map((r) => <TableRow key={r.region}><TableCell>{r.region}</TableCell><TableCell><CellText cell={r.donors_called} /></TableCell><TableCell><CellText cell={r.follow_ups} /></TableCell></TableRow>)}</TableBody>
                </Table>
                <RangeNote meta={data} />
                <DonorMix mix={data.donor_mix} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Team coverage</CardTitle><CardDescription>Which regions each team's calls cover. Gaps are regions with no row for a team.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {data.team_coverage.map((t) => (
                  <div key={t.team_id}>
                    <h3 className="mb-1 text-sm font-medium">{t.team}</h3>
                    <div className="flex flex-wrap gap-2 text-sm">{t.regions.map((r) => <span key={r.region} className="rounded border px-2 py-1">{r.region}: <CellText cell={r.donors_called} /></span>)}{!t.regions.length ? <span className="text-muted-foreground">No calls in this range.</span> : null}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </LoadState>
    </>
  );
}
