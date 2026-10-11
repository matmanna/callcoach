import { LoadState, ModelNote, PageHeader, fmtDateTime } from "@/components/dash/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

interface Item { id: string; label: string; red: boolean; reason: string; log_id: string; donor_id: string; donor_ref: string; team: string; age_hours: number; created_at: string }
interface PL { id: string; limit: string; donor_id: string; donor_ref: string; donor_name: string; log_id: string; created_at: string }
type Action = "approve" | "override" | "resolve";

export function QueuePage() {
  const scope = useTeamScope();
  const q = useApi<{ note: string; items: Item[] }>(withQuery("/queue", scope.q));
  const pl = useApi<{ pending_limits: PL[] }>(withQuery("/pending-limits", scope.q));
  const [dlg, setDlg] = useState<{ item: Item; action: Action } | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const needsNote = dlg ? dlg.action === "override" || (dlg.action === "resolve" && dlg.item.red) : false;
  const decide = async () => {
    try {
      await api(withQuery(`/queue/${dlg!.item.id}/decision`, scope.q), { body: { action: dlg!.action, ...(note.trim() ? { note } : {}) } });
      toast.success(`Flag ${dlg!.action === "approve" ? "approved" : dlg!.action === "override" ? "overridden" : "resolved"}`);
      setDlg(null);
      q.reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const limit = async (id: string, action: "approve" | "reject") => {
    try {
      await api(`/pending-limits/${id}/${action}`, { body: {} });
      toast.success(action === "approve" ? "Limit written to the donor record" : "Limit rejected");
      pl.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      <PageHeader title="Coordinator queue" description={<ModelNote />} />
      <LoadState loading={q.loading} error={q.error}>
        <Table>
          <TableHeader><TableRow><TableHead>Label</TableHead><TableHead>Reason</TableHead><TableHead>Source log</TableHead><TableHead>Donor</TableHead><TableHead>Age</TableHead><TableHead className="text-right">Decision</TableHead></TableRow></TableHeader>
          <TableBody>
            {q.data?.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell><Badge variant={i.red ? "destructive" : "outline"}>{i.label.replace("_", " ")}</Badge></TableCell>
                <TableCell>{i.reason}<div className="text-xs text-muted-foreground">Suggested by model, needs review.</div></TableCell>
                <TableCell><Link className="underline" to={scope.link(`/coordinator/calls/${i.log_id}`)}>View log</Link></TableCell>
                <TableCell><Link className="underline" to={scope.link(`/coordinator/contacts/${i.donor_id}`)}>{i.donor_ref}</Link></TableCell>
                <TableCell>{i.age_hours} h</TableCell>
                <TableCell className="space-x-1 text-right">
                  {(["approve", "override", "resolve"] as const).map((a) => (
                    <Button key={a} size="sm" variant={a === "approve" ? "default" : "outline"} onClick={() => (setNote(""), setErr(null), setDlg({ item: i, action: a }))}>{a[0]!.toUpperCase() + a.slice(1)}</Button>
                  ))}
                </TableCell>
              </TableRow>
            ))}
            {q.data && !q.data.items.length ? <TableRow><TableCell colSpan={6} className="text-muted-foreground">The queue is empty.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
        <p className="pt-2 text-xs text-muted-foreground">Red labels (distress, stop contact, off-script claim) are decided one at a time. Batch resolve is not available for them.</p>
      </LoadState>

      <Card className="mt-6">
        <CardHeader><CardTitle>Pending limits</CardTitle><CardDescription>Approving writes the limit to the donor record as a new version. Rejecting leaves the record unchanged.</CardDescription></CardHeader>
        <CardContent>
          <LoadState loading={pl.loading} error={pl.error}>
            <Table>
              <TableHeader><TableRow><TableHead>Limit</TableHead><TableHead>Donor</TableHead><TableHead>Source log</TableHead><TableHead>Requested</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {pl.data?.pending_limits.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.limit}</TableCell>
                    <TableCell><Link className="underline" to={scope.link(`/coordinator/contacts/${p.donor_id}`)}>{p.donor_name || p.donor_ref}</Link></TableCell>
                    <TableCell><Link className="underline" to={scope.link(`/coordinator/calls/${p.log_id}`)}>View log</Link></TableCell>
                    <TableCell>{fmtDateTime(p.created_at)}</TableCell>
                    <TableCell className="space-x-1 text-right"><Button size="sm" onClick={() => limit(p.id, "approve")}>Approve</Button><Button size="sm" variant="outline" onClick={() => limit(p.id, "reject")}>Reject</Button></TableCell>
                  </TableRow>
                ))}
                {pl.data && !pl.data.pending_limits.length ? <TableRow><TableCell colSpan={5} className="text-muted-foreground">No pending limits.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </LoadState>
        </CardContent>
      </Card>

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dlg?.action === "approve" ? "Approve" : dlg?.action === "override" ? "Override" : "Resolve"}: {dlg?.item.label.replace("_", " ")}</DialogTitle>
            <DialogDescription>{needsNote ? "A note is required." : "A note is optional."} The decision is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Decision note" value={note} onChange={(e) => setNote(e.target.value)} />
          {err ? <FieldError>{err}</FieldError> : null}
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button disabled={needsNote && !note.trim()} onClick={decide}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
