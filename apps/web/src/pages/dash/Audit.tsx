import { LoadState, PageHeader, Pager, fmtDateTime } from "@/components/dash/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { withQuery } from "@/lib/teamScope";
import { useState } from "react";

interface Row { id: string; ts: string; who: string; action: string; target_type: string; target_id: string; note: string | null }
const LIMIT = 50;
const ANY = "any";

export function AuditPage() {
  const [cursor, setCursor] = useState(0);
  const [actor, setActor] = useState(ANY);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const actors = useApi<{ actors: Array<{ id: string; name: string }> }>("/audit/actors");
  const filters = [actor !== ANY && `actor=${encodeURIComponent(actor)}`, action && `action=${encodeURIComponent(action)}`, targetType && `target_type=${encodeURIComponent(targetType)}`, from && `from=${from}`, to && `to=${to}`];
  const { data, error, loading } = useApi<{ total: number; rows: Row[] }>(withQuery("/audit", `limit=${LIMIT}`, `cursor=${cursor}`, ...filters));
  const r = <T,>(set: (v: T) => void) => (v: T) => (setCursor(0), set(v));
  return (
    <>
      <PageHeader title="Audit log" description="Read-only record of who did what. It holds no call text." actions={<Button variant="outline" asChild><a href={`/api${withQuery("/audit.csv", ...filters)}`}>Export CSV</a></Button>} />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Select value={actor} onValueChange={r(setActor)}>
          <SelectTrigger className="w-52" aria-label="Actor"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ANY}>Any actor</SelectItem>{actors.data?.actors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="w-48" placeholder="Action (e.g. flag.resolve)" value={action} onChange={(e) => r(setAction)(e.target.value)} aria-label="Action" />
        <Input className="w-40" placeholder="Target type" value={targetType} onChange={(e) => r(setTargetType)(e.target.value)} aria-label="Target type" />
        <label className="text-xs text-muted-foreground">From<Input type="date" className="w-40" value={from} onChange={(e) => r(setFrom)(e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">To<Input type="date" className="w-40" value={to} onChange={(e) => r(setTo)(e.target.value)} /></label>
      </div>
      <LoadState loading={loading} error={error}>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
          <TableBody>
            {data?.rows.map((a) => <TableRow key={a.id}><TableCell>{fmtDateTime(a.ts)}</TableCell><TableCell>{a.who}</TableCell><TableCell>{a.action}</TableCell><TableCell>{a.target_type}</TableCell><TableCell className="max-w-sm whitespace-normal text-muted-foreground">{a.note}</TableCell></TableRow>)}
          </TableBody>
        </Table>
        {data ? <Pager total={data.total} cursor={cursor} limit={LIMIT} onChange={setCursor} /> : null}
      </LoadState>
    </>
  );
}
