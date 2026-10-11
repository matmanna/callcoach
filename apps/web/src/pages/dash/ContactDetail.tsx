import { LoadState, PageHeader, fmtDate, fmtDateTime } from "@/components/dash/bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useTeamScope } from "@/lib/teamScope";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

interface Stated { key: string; value: string; source: string; stated_on: string; version: number }
interface Dossier {
  donor: { id: string; external_id: string; first_name: string; last_name: string; campaign: string; gift_band: string; past_gift_count: number; last_gift_band: string; region: string | null; teams: Array<{ id: string; name: string }> };
  limits: Stated[];
  preferences: Stated[];
  follow_ups: Array<{ id: string; action: string; due_date: string | null; owner: string; overdue: boolean }>;
  timeline: Array<{ id: string; at: string; caller: string; outcome: string | null; preference: string | null; reason: string }>;
  gifts: Array<{ id: string; amount_band: string; campaign: string; gift_date: string }>;
}
interface History { versions: Array<{ key: string; kind: string; version: number; value: string; source: string; stated_on: string; status: string; recorded_at: string; recorded_by: string }> }

type Editing = { mode: "add" | "edit" | "remove" | "preference"; item?: Stated } | null;

const today = () => new Date().toISOString().slice(0, 10);

export function ContactDetailPage() {
  const { id = "" } = useParams();
  const scope = useTeamScope();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<Dossier>(`/contacts/${id}`);
  const hist = useApi<History>(`/contacts/${id}/history`);
  const [editing, setEditing] = useState<Editing>(null);
  const [form, setForm] = useState({ value: "", source: "", stated_on: today() });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [delError, setDelError] = useState<string | null>(null);

  const open = (e: NonNullable<Editing>) => {
    setFormError(null);
    setForm({ value: e.item?.value ?? "", source: "", stated_on: today() });
    setEditing(e);
  };
  const save = async () => {
    try {
      if (editing?.mode === "preference") await api(`/contacts/${id}/preferences`, { body: { value: form.value, source: form.source, stated_on: form.stated_on } });
      else if (editing) await api(`/contacts/${id}/limits`, { method: "PATCH", body: { action: editing.mode, key: editing.item?.key, value: editing.mode === "remove" ? undefined : form.value, source: form.source, stated_on: form.stated_on } });
      toast.success("Saved as a new version");
      setEditing(null);
      reload();
      hist.reload();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };
  const del = async () => {
    try {
      await api(`/contacts/${id}`, { method: "DELETE", body: { confirm_external_id: confirm } });
      toast.success("Dossier deleted");
      navigate(scope.link("/coordinator/contacts"));
    } catch (err) {
      setDelError(errorMessage(err));
    }
  };

  const stated = (title: string, items: Stated[], kind: "limit" | "preference") => (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Each edit keeps the old value with its date.</CardDescription>
        </div>
        <Button size="sm" onClick={() => open({ mode: kind === "limit" ? "add" : "preference" })}>Add</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((l) => (
          <div key={l.key} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
            <div>
              <div className="font-medium">{l.value}</div>
              <div className="text-xs text-muted-foreground">Source: {l.source}. Stated {fmtDate(l.stated_on)}. Version {l.version}.</div>
            </div>
            {kind === "limit" ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => open({ mode: "edit", item: l })}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => open({ mode: "remove", item: l })}>Remove</Button>
              </div>
            ) : null}
          </div>
        ))}
        {!items.length ? <p className="text-sm text-muted-foreground">None recorded.</p> : null}
      </CardContent>
    </Card>
  );

  return (
    <LoadState loading={loading} error={error}>
      {data ? (
        <>
          <PageHeader
            title={`${data.donor.first_name} ${data.donor.last_name}`}
            description={<>Reference {data.donor.external_id}. {data.donor.teams.map((t) => t.name).join(", ")}. Campaign: {data.donor.campaign}.</>}
            actions={<Button variant="outline" onClick={() => (setConfirm(""), setDelError(null), setDeleting(true))}>Delete dossier</Button>}
          />
          <Tabs defaultValue="dossier">
            <TabsList>
              <TabsTrigger value="dossier">Dossier</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="dossier" className="space-y-4 pt-3">
              <div className="grid gap-4 lg:grid-cols-2">
                {stated("Stated limits", data.limits, "limit")}
                {stated("Stated preferences", data.preferences, "preference")}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Open follow-ups</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {data.follow_ups.map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded border p-2">
                        <span>{f.action} <span className="text-muted-foreground">({f.owner})</span></span>
                        <span>{f.overdue ? <Badge variant="destructive">overdue</Badge> : null} {fmtDate(f.due_date)}</span>
                      </div>
                    ))}
                    {!data.follow_ups.length ? <p className="text-muted-foreground">None open.</p> : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Gifts</CardTitle><CardDescription>{data.donor.past_gift_count} past gifts. Last band {data.donor.last_gift_band}.</CardDescription></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {data.gifts.map((g) => <div key={g.id} className="flex justify-between"><span>{g.campaign}</span><span>{g.amount_band}, {fmtDate(g.gift_date)}</span></div>)}
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>Approved call logs</CardTitle><CardDescription>Fields only. No call text is stored.</CardDescription></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Caller</TableHead><TableHead>Outcome</TableHead><TableHead>Preference</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.timeline.map((t) => (
                        <TableRow key={t.id}><TableCell>{fmtDateTime(t.at)}</TableCell><TableCell>{t.caller}</TableCell><TableCell>{t.outcome}</TableCell><TableCell>{t.preference}</TableCell><TableCell>{t.reason}</TableCell></TableRow>
                      ))}
                      {!data.timeline.length ? <TableRow><TableCell colSpan={5} className="text-muted-foreground">No approved logs yet.</TableCell></TableRow> : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="history" className="pt-3">
              <LoadState loading={hist.loading} error={hist.error}>
                <Table>
                  <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>Version</TableHead><TableHead>Value</TableHead><TableHead>Source</TableHead><TableHead>Stated</TableHead><TableHead>Status</TableHead><TableHead>Recorded</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {hist.data?.versions.map((v, i) => (
                      <TableRow key={`${v.key}-${v.version}-${i}`}>
                        <TableCell>{v.kind}</TableCell><TableCell>{v.version}</TableCell><TableCell>{v.value}</TableCell><TableCell>{v.source}</TableCell><TableCell>{fmtDate(v.stated_on)}</TableCell>
                        <TableCell><Badge variant={v.status === "active" ? "secondary" : "outline"}>{v.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{fmtDateTime(v.recorded_at)} by {v.recorded_by}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </LoadState>
            </TabsContent>
          </Tabs>

          <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing?.mode === "edit" ? "Edit stated limit" : editing?.mode === "remove" ? "Remove stated limit" : editing?.mode === "preference" ? "Add stated preference" : "Add stated limit"}</DialogTitle>
                <DialogDescription>Saved as a new version. The previous value is kept with its date.</DialogDescription>
              </DialogHeader>
              <FieldGroup>
                {editing?.mode !== "remove" ? (
                  <Field><FieldLabel htmlFor="lv">Value</FieldLabel><Input id="lv" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
                ) : <p className="text-sm">Removing: <b>{editing.item?.value}</b></p>}
                <Field><FieldLabel htmlFor="ls">Source</FieldLabel><Input id="ls" placeholder="Donor, by phone on a call" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
                <Field><FieldLabel htmlFor="ld">Date stated</FieldLabel><Input id="ld" type="date" value={form.stated_on} onChange={(e) => setForm({ ...form, stated_on: e.target.value })} /></Field>
                {formError ? <FieldError>{formError}</FieldError> : null}
              </FieldGroup>
              <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save} disabled={!form.source.trim() || (editing?.mode !== "remove" && !form.value.trim())}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={deleting} onOpenChange={setDeleting}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this dossier?</DialogTitle>
                <DialogDescription>This permanently removes the contact, gifts, limit history, call logs, flags, follow-ups and ratings for this donor. It cannot be undone.</DialogDescription>
              </DialogHeader>
              <Alert variant="destructive"><AlertTitle>Type {data.donor.external_id} to confirm</AlertTitle><AlertDescription>One audit row (counts only) is written.</AlertDescription></Alert>
              <Input aria-label="Confirm reference" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {delError ? <FieldError>{delError}</FieldError> : null}
              <DialogFooter><Button variant="outline" onClick={() => setDeleting(false)}>Cancel</Button><Button variant="destructive" disabled={confirm !== data.donor.external_id} onClick={del}>Delete permanently</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </LoadState>
  );
}
