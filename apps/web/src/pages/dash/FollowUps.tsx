import { LoadState, PageHeader, fmtDate } from "@/components/dash/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";
import { toast } from "sonner";

interface FU { id: string; action: string; due_date: string | null; status: string; owner: string; donor_ref: string; team: string; overdue: boolean; handed_off: boolean; note: string | null }

export function FollowUpsPage() {
  const scope = useTeamScope();
  const [filter, setFilter] = useState("open");
  const { data, error, loading, reload } = useApi<{ follow_ups: FU[] }>(withQuery("/follow-ups", scope.q, filter === "overdue" ? "overdue=true" : filter !== "all" && `status=${filter}`));
  const [target, setTarget] = useState<FU | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const cancel = async () => {
    try {
      await api(`/follow-ups/${target!.id}/cancel`, { body: { idempotency_key: crypto.randomUUID(), note } });
      toast.success("Follow-up cancelled");
      setTarget(null);
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <>
      <PageHeader title="Follow-ups" description="Overdue means the due date has passed in the team's time zone. Nothing is sent automatically." />
      <div className="mb-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48" aria-label="Filter"><SelectValue /></SelectTrigger>
          <SelectContent>{[["open", "Open"], ["overdue", "Overdue"], ["handed_off", "Handed off"], ["done", "Done"], ["cancelled", "Cancelled"], ["all", "All"]].map(([v, l]) => <SelectItem key={v} value={v!}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <LoadState loading={loading} error={error}>
        <Table>
          <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Donor</TableHead><TableHead>Owner</TableHead><TableHead>Team</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data?.follow_ups.map((f) => (
              <TableRow key={f.id} className={f.overdue ? "bg-destructive/10" : undefined}>
                <TableCell>{f.action}</TableCell><TableCell>{f.donor_ref}</TableCell><TableCell>{f.owner}</TableCell><TableCell>{f.team}</TableCell>
                <TableCell>{fmtDate(f.due_date)} {f.overdue ? <Badge variant="destructive">overdue</Badge> : null}</TableCell>
                <TableCell><Badge variant="outline">{f.status.replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-right">{f.status === "open" ? <Button size="sm" variant="ghost" onClick={() => (setNote(""), setErr(null), setTarget(f))}>Cancel</Button> : null}</TableCell>
              </TableRow>
            ))}
            {data && !data.follow_ups.length ? <TableRow><TableCell colSpan={7} className="text-muted-foreground">Nothing here.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </LoadState>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel this follow-up?</DialogTitle><DialogDescription>A note is required and is recorded in the audit log.</DialogDescription></DialogHeader>
          <Textarea aria-label="Cancellation note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this being cancelled?" />
          {err ? <FieldError>{err}</FieldError> : null}
          <DialogFooter><Button variant="outline" onClick={() => setTarget(null)}>Keep</Button><Button variant="destructive" disabled={!note.trim()} onClick={cancel}>Cancel follow-up</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
