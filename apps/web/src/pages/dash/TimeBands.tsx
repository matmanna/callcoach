import { CellText, DonorMix, LoadState, PageHeader, RangeNote, cellValue, type Cell } from "@/components/dash/bits";
import { SeriesChart } from "@/components/dash/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";

interface Res { range: { from: string; to: string }; denominator: { what: string; count: Cell }; donor_mix: Record<"first_time" | "lapsed" | "recent", Cell>; rows: Array<{ band: string; calls: Cell }>; total: Cell }

export function TimeBandsPage() {
  const scope = useTeamScope();
  const { data, error, loading } = useApi<Res>(withQuery("/insights/charts", "kind=time_bands", scope.q));
  return (
    <>
      <PageHeader title="Time" description="Calls completed by time of day in the caller's local time, in 3-hour bands." />
      <LoadState loading={loading} error={error}>
        {data ? (
          <Card>
            <CardHeader><CardTitle>Calls by time band</CardTitle><CardDescription>Bands under 5 calls are suppressed.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <SeriesChart x="band" data={data.rows.map((r) => ({ band: r.band, Calls: cellValue(r.calls) }))} series={[{ key: "Calls", label: "Calls" }]} />
              <Table>
                <TableHeader><TableRow><TableHead>Band (local hours)</TableHead><TableHead>Calls</TableHead></TableRow></TableHeader>
                <TableBody>{data.rows.map((r) => <TableRow key={r.band}><TableCell>{r.band}</TableCell><TableCell><CellText cell={r.calls} /></TableCell></TableRow>)}<TableRow><TableCell className="font-medium">All bands</TableCell><TableCell><CellText cell={data.total} /></TableCell></TableRow></TableBody>
              </Table>
              <RangeNote meta={data} />
              <DonorMix mix={data.donor_mix} />
            </CardContent>
          </Card>
        ) : null}
      </LoadState>
    </>
  );
}
