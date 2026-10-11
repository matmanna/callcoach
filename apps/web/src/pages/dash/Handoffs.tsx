import { LoadState, PageHeader, fmtDate } from "@/components/dash/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { flattenTeams, useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";
import { toast } from "sonner";

interface Packet { _id: string; from: string; to: string; direction: "incoming" | "outgoing"; team: string; note: string; status: "open" | "acknowledged"; created_at: string; items: Array<{ id: string; kind: string; label: string; acknowledged_at: string | null }> }

export function HandoffsPage() {
  const scope = useTeamScope();
  const { me } = useSession();
  const { data, error, loading, reload } = useApi<{ packets: Packet[] }>(withQuery("/handoffs", scope.q));
  const coords = useApi<{ coordinators: Array<{ user_id: string; name: string; is_me: boolean }> }>("/coordinators");
  const fus = useApi<{ follow_ups: Array<{ id: string; action: string; donor_ref: string; owner: string }> }>(withQuery("/follow-ups", scope.q, "status=open"));
  const entries = useApi<{ entries: Array<{ _id: string; title: string; status: string }> }>(withQuery("/knowledge", scope.q, "status=published"));
  const teams = flattenTeams(me?.teams ?? []).filter((t) => t.role === "coordinator");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ team_id: "", to_user_id: "", note: "" });
  const [fuIds, setFuIds] = useState<string[]>([]);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...list, id] : list.filter((x) => x !== id));

  const create = async () => {
    try {
      await api(withQuery("/handoffs", scope.q), { body: { ...form, follow_up_ids: fuIds, entry_ids: entryIds } });
      toast.success("Handoff packet created. It is not sent anywhere; the recipient sees it here.");
      setOpen(false);
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const ack = async (p: string, item: string) => {
    try {
      await api(withQuery(`/handoffs/${p}/items/${item}/acknowledge`, scope.q), { body: {} });
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      <PageHeader title="Handoff packets" description="Built from open follow-ups and published entries. The incoming coordinator acknowledges each item. Nothing is sent automatically." actions={<Button onClick={() => (setForm({ team_id: scope.team !== "all" ? scope.team : (teams[0]?._id ?? ""), to_user_id: "", note: "" }), setFuIds([]), setEntryIds([]), setErr(null), setOpen(true))}>New packet</Button>} />
      <LoadState loading={loading} error={error}>
        {data?.packets.map((p) => (
          <Card key={p._id} className="mb-3">
            <CardHeader><CardTitle className="flex items-center gap-2">{p.direction === "incoming" ? `From ${p.from}` : `To ${p.to}`} <Badge variant="outline">{p.direction}</Badge> <Badge variant={p.status === "acknowledged" ? "secondary" : "outline"}>{p.status}</Badge></CardTitle><CardDescription>{p.team}, {fmtDate(p.created_at)}. {p.note}</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {p.items.map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <Checkbox id={i.id} checked={!!i.acknowledged_at} disabled={p.direction !== "incoming" || !!i.acknowledged_at} onCheckedChange={() => ack(p._id, i.id)} />
                  <Label htmlFor={i.id} className="font-normal">{i.kind === "follow_up" ? "Follow-up" : "Entry"}: {i.label}</Label>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        {data && !data.packets.length ? <p className="text-muted-foreground">No handoff packets.</p> : null}
      </LoadState>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>New handoff packet</DialogTitle><DialogDescription>Choose the incoming coordinator and what to include.</DialogDescription></DialogHeader>
          <FieldGroup>
            <Field><FieldLabel>Team</FieldLabel>
              <Select value={form.team_id} onValueChange={(v) => setForm({ ...form, team_id: v })}><SelectTrigger className="w-full"><SelectValue placeholder="Team" /></SelectTrigger><SelectContent>{teams.map((t) => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}</SelectContent></Select>
            </Field>
            <Field><FieldLabel>Incoming coordinator</FieldLabel>
              <Select value={form.to_user_id} onValueChange={(v) => setForm({ ...form, to_user_id: v })}><SelectTrigger className="w-full"><SelectValue placeholder="Choose a coordinator" /></SelectTrigger><SelectContent>{coords.data?.coordinators.filter((c) => !c.is_me).map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>)}</SelectContent></Select>
            </Field>
            <Field><FieldLabel>Open follow-ups</FieldLabel>
              {fus.data?.follow_ups.map((f) => <div key={f.id} className="flex items-center gap-2 text-sm"><Checkbox id={`f-${f.id}`} checked={fuIds.includes(f.id)} onCheckedChange={(v) => toggle(fuIds, setFuIds, f.id, v === true)} /><Label htmlFor={`f-${f.id}`} className="font-normal">{f.action} ({f.donor_ref}, {f.owner})</Label></div>)}
              {fus.data && !fus.data.follow_ups.length ? <p className="text-sm text-muted-foreground">None open.</p> : null}
            </Field>
            <Field><FieldLabel>Published entries</FieldLabel>
              {entries.data?.entries.map((e) => <div key={e._id} className="flex items-center gap-2 text-sm"><Checkbox id={`e-${e._id}`} checked={entryIds.includes(e._id)} onCheckedChange={(v) => toggle(entryIds, setEntryIds, e._id, v === true)} /><Label htmlFor={`e-${e._id}`} className="font-normal">{e.title}</Label></div>)}
              {entries.data && !entries.data.entries.length ? <p className="text-sm text-muted-foreground">No published entries.</p> : null}
            </Field>
            <Field><FieldLabel htmlFor="hn">Note</FieldLabel><Textarea id="hn" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            {err ? <FieldError>{err}</FieldError> : null}
          </FieldGroup>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!form.team_id || !form.to_user_id || (!fuIds.length && !entryIds.length)} onClick={create}>Create packet</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
