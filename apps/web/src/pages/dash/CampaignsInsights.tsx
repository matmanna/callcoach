import { CellText, DonorMix, LoadState, PageHeader, RangeNote, type Cell } from "@/components/dash/bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";

type Mix = Record<"first_time" | "lapsed" | "recent", Cell>;
interface Res { range: { from: string; to: string }; denominator: { what: string; count: Cell }; donor_mix: Mix; campaigns: Array<{ id: string; name: string; donors: Cell; calls: Cell; donor_mix: Mix }> }

export function CampaignsInsightsPage() {
  const scope = useTeamScope();
  const { data, error, loading } = useApi<Res>(withQuery("/insights/campaigns", scope.q));
  return (
    <>
      <PageHeader title="Campaigns" description="Donors and calls by campaign, with the donor mix beside each figure." />
      <LoadState loading={loading} error={error}>
        {data ? (
          <>
            <Table>
              <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Donors</TableHead><TableHead>Calls in range</TableHead><TableHead>First-time donors</TableHead><TableHead>Lapsed</TableHead><TableHead>Recent</TableHead></TableRow></TableHeader>
              <TableBody>{data.campaigns.map((c) => <TableRow key={c.id}><TableCell>{c.name}</TableCell><TableCell><CellText cell={c.donors} /></TableCell><TableCell><CellText cell={c.calls} /></TableCell><TableCell><CellText cell={c.donor_mix.first_time} /></TableCell><TableCell><CellText cell={c.donor_mix.lapsed} /></TableCell><TableCell><CellText cell={c.donor_mix.recent} /></TableCell></TableRow>)}</TableBody>
            </Table>
            <div className="pt-3"><RangeNote meta={data} /><DonorMix mix={data.donor_mix} /></div>
          </>
        ) : null}
      </LoadState>
    </>
  );
}
