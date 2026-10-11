import { LoadState, PageHeader, Pager, fmtDate } from "@/components/dash/bits";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";
import { Link } from "react-router";

interface Call { id: string; date: string; caller: string; donor_ref: string; outcome: string; preference: string; follow_up_status: string; approval_status: string; team: string }
const LIMIT = 25;

export function CallsPage() {
  const scope = useTeamScope();
  const [cursor, setCursor] = useState(0);
  const [status, setStatus] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const { data, error, loading } = useApi<{ total: number; calls: Call[] }>(withQuery("/calls", scope.q, `limit=${LIMIT}`, `cursor=${cursor}`, status !== "all" && `status=${status}`, outcome !== "all" && `outcome=${outcome}`));
  return (
    <>
      <PageHeader title="Calls and logs" description="Donors are shown by reference. Logs hold fields only: no note text is stored." />
      <div className="mb-3 flex gap-3">
        <Select value={status} onValueChange={(v) => (setCursor(0), setStatus(v))}>
          <SelectTrigger className="w-44" aria-label="Approval status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any approval status</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="draft">Pending approval</SelectItem></SelectContent>
        </Select>
        <Select value={outcome} onValueChange={(v) => (setCursor(0), setOutcome(v))}>
          <SelectTrigger className="w-44" aria-label="Outcome"><SelectValue /></SelectTrigger>
          <SelectContent>{["all", "reached", "voicemail", "no_answer", "declined", "rescheduled"].map((o) => <SelectItem key={o} value={o}>{o === "all" ? "Any outcome" : o.replace("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <LoadState loading={loading} error={error}>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Caller</TableHead><TableHead>Donor</TableHead><TableHead>Team</TableHead><TableHead>Outcome</TableHead><TableHead>Preference</TableHead><TableHead>Follow-up</TableHead><TableHead>Approval</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.calls.map((c) => (
              <TableRow key={c.id}>
                <TableCell><Link className="underline" to={scope.link(`/coordinator/calls/${c.id}`)}>{fmtDate(c.date)}</Link></TableCell>
                <TableCell>{c.caller}</TableCell><TableCell>{c.donor_ref}</TableCell><TableCell>{c.team}</TableCell>
                <TableCell>{c.outcome.replace("_", " ")}</TableCell><TableCell>{c.preference.replace("_", " ")}</TableCell><TableCell>{c.follow_up_status}</TableCell>
                <TableCell><Badge variant={c.approval_status === "approved" ? "secondary" : "outline"}>{c.approval_status === "draft" ? "pending" : c.approval_status}</Badge></TableCell>
              </TableRow>
            ))}
            {data && !data.calls.length ? <TableRow><TableCell colSpan={8} className="text-muted-foreground">No calls yet.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
        {data ? <Pager total={data.total} cursor={cursor} limit={LIMIT} onChange={setCursor} /> : null}
      </LoadState>
    </>
  );
}
