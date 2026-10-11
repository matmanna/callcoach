import { LoadState, PageHeader, fmtDate } from "@/components/dash/bits";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { wordDiff } from "@/lib/diff";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { FACT_TEXT_MAX } from "@sc/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface VersionView { version: number; text: string; source: string; verified_on: string; owner: string; owner_user_id: string; created_by: string; created_by_id: string; self_approved: boolean }
interface Item { id: string; status: "draft" | "approved" | "stale"; version: number; approved: VersionView | null; draft: VersionView | null; has_pending_draft: boolean; history: Array<{ version: number; status: string; text: string; created_at: string; created_by: string }> }
interface Sheet { id: string; name: string; campaigns: string[]; items: Item[] }
interface Res { stale_after_days: number; fact_sheets: Sheet[] }
interface Coords { coordinators: Array<{ user_id: string; name: string; is_me: boolean }> }
interface VersionRow { id: string; item_id: string; version: number; status: string }

type Dlg = { kind: "edit"; sheet: Sheet; item?: Item } | { kind: "reverify"; sheet: Sheet; item: Item } | { kind: "review"; sheet: Sheet; item: Item } | null;
const today = () => new Date().toISOString().slice(0, 10);

function Diff({ before, after }: { before: string; after: string }) {
  return (
    <p className="rounded border p-3 text-sm leading-relaxed">
      {wordDiff(before, after).map((p, i) => (
        <span key={i} className={p.kind === "add" ? "bg-green-500/20" : p.kind === "del" ? "bg-red-500/20 line-through" : undefined}>{p.text}</span>
      ))}
    </p>
  );
}

export function FactSheetEditorPage() {
  const { me } = useSession();
  const [campaign, setCampaign] = useState("all");
  const { data, error, loading, reload } = useApi<Res>(campaign === "all" ? "/fact-sheets" : `/fact-sheets?campaign=${encodeURIComponent(campaign)}`);
  const camps = useApi<{ campaigns: Array<{ _id: string; name: string }> }>("/campaigns");
  const coords = useApi<Coords>("/coordinators");
  const [dlg, setDlg] = useState<Dlg>(null);
  const [form, setForm] = useState({ text: "", source: "", verified_on: today(), owner_user_id: "" });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const myId = me?.user.id ?? "";

  useEffect(() => {
    if (!dlg || dlg.kind !== "edit") return;
    const t = setTimeout(() => {
      if (!form.text.trim()) return setWarnings([]);
      api<{ warnings: string[] }>("/fact-sheets/check", { body: { text: form.text } }).then((r) => setWarnings(r.warnings)).catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [dlg, form.text]);

  const openEdit = (sheet: Sheet, item?: Item) => {
    const base = item?.draft ?? item?.approved;
    setForm({ text: base?.text ?? "", source: base?.source ?? "", verified_on: base?.verified_on ?? today(), owner_user_id: base?.owner_user_id ?? myId });
    setWarnings([]);
    setFormError(null);
    setDlg({ kind: "edit", sheet, ...(item ? { item } : {}) });
  };
  const save = async () => {
    if (dlg?.kind !== "edit") return;
    try {
      const r = await api<{ warnings: string[] }>(`/fact-sheets/${dlg.sheet.id}/versions`, { body: { ...(dlg.item ? { item_id: dlg.item.id } : {}), ...form } });
      toast.success(r.warnings.length ? "Draft saved, with warnings. It cannot be approved until they are fixed." : "Draft saved. Callers still see the approved version.");
      setDlg(null);
      reload();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };
  const approve = async (sheet: Sheet, item: Item) => {
    try {
      const versions = await api<{ versions: VersionRow[] }>(`/fact-sheets/${sheet.id}/versions`);
      const v = versions.versions.find((x) => x.item_id === item.id && x.status === "draft");
      if (!v) throw new Error("No draft to approve");
      const r = await api<{ self_approved: boolean }>(`/fact-sheets/${sheet.id}/versions/${v.id}/approve`, { body: note.trim() ? { note } : {} });
      toast.success(r.self_approved ? "Approved (recorded as a self-approval: you are the only coordinator)" : "Approved. Callers now see this version.");
      setDlg(null);
      reload();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };
  const reverify = async () => {
    if (dlg?.kind !== "reverify") return;
    try {
      await api(`/fact-sheets/${dlg.sheet.id}/items/${dlg.item.id}/reverify`, { body: { source: form.source, verified_on: form.verified_on } });
      toast.success("Re-verification saved as a draft version. It needs approval.");
      setDlg(null);
      reload();
    } catch (e) {
      setFormError(errorMessage(e));
    }
  };

  const tooLong = form.text.length > FACT_TEXT_MAX;
  const complete = form.text.trim() && form.source.trim() && form.verified_on && form.owner_user_id && !tooLong;

  return (
    <>
      <PageHeader
        title="Fact sheets"
        description={`Editing creates a new version. Callers keep seeing the approved version until a new one is approved. Items older than ${data?.stale_after_days ?? 365} days are stale and hidden from callers.`}
        actions={
          <Select value={campaign} onValueChange={setCampaign}>
            <SelectTrigger className="w-56" aria-label="Campaign"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All campaigns</SelectItem>{camps.data?.campaigns.map((c) => <SelectItem key={c._id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        }
      />
      <LoadState loading={loading} error={error}>
        {data?.fact_sheets.map((s) => (
          <Card key={s.id} className="mb-4">
            <CardHeader className="flex-row items-start justify-between">
              <div><CardTitle>{s.name}</CardTitle><CardDescription>{s.campaigns.length ? s.campaigns.join(", ") : "Not linked to a campaign"}</CardDescription></div>
              <Button size="sm" onClick={() => openEdit(s)}>Add item</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Text</TableHead><TableHead>Source</TableHead><TableHead>Owner</TableHead><TableHead>Verified</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {s.items.map((i) => {
                    const last = i.history.at(-1);
                    const shown = i.approved ?? i.draft ?? { text: last?.text ?? "", source: "", owner: "", verified_on: "", version: last?.version ?? 1 };
                    return (
                      <TableRow key={i.id}>
                        <TableCell className="max-w-md whitespace-normal">{shown.text}{i.has_pending_draft && i.approved ? <div className="pt-1 text-xs text-muted-foreground">Pending draft v{i.draft!.version}</div> : null}</TableCell>
                        <TableCell className="max-w-48 whitespace-normal text-muted-foreground">{shown.source}</TableCell>
                        <TableCell>{shown.owner}</TableCell>
                        <TableCell>{fmtDate(shown.verified_on)}</TableCell>
                        <TableCell><Badge variant={i.status === "approved" ? "secondary" : i.status === "stale" ? "destructive" : "outline"}>{i.status}</Badge></TableCell>
                        <TableCell>v{i.version}</TableCell>
                        <TableCell className="space-x-1 text-right">
                          {i.has_pending_draft ? <Button size="sm" onClick={() => (setNote(""), setFormError(null), setDlg({ kind: "review", sheet: s, item: i }))}>Review draft</Button> : null}
                          {i.status === "stale" ? <Button size="sm" variant="outline" onClick={() => (setForm({ text: "", source: shown.source, verified_on: today(), owner_user_id: "" }), setFormError(null), setDlg({ kind: "reverify", sheet: s, item: i }))}>Re-verify</Button> : null}
                          <Button size="sm" variant="outline" onClick={() => openEdit(s, i)}>Edit</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
        {data && !data.fact_sheets.length ? <p className="text-muted-foreground">No fact sheets yet. Import one from Admin, Imports.</p> : null}
      </LoadState>

      <Dialog open={dlg?.kind === "edit"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{dlg?.kind === "edit" && dlg.item ? "Edit item (new draft version)" : "New fact item"}</DialogTitle><DialogDescription>Text, source, verified date, and owner are all required.</DialogDescription></DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ft">Text</FieldLabel>
              <Textarea id="ft" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
              <FieldDescription className={tooLong ? "text-destructive" : undefined}>{form.text.length} / {FACT_TEXT_MAX} characters</FieldDescription>
            </Field>
            <Field><FieldLabel htmlFor="fs">Source</FieldLabel><Input id="fs" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="fv">Verified on</FieldLabel><Input id="fv" type="date" value={form.verified_on} onChange={(e) => setForm({ ...form, verified_on: e.target.value })} /></Field>
            <Field>
              <FieldLabel htmlFor="fo">Owner</FieldLabel>
              <Select value={form.owner_user_id} onValueChange={(v) => setForm({ ...form, owner_user_id: v })}>
                <SelectTrigger id="fo" className="w-full"><SelectValue placeholder="Choose an owner" /></SelectTrigger>
                <SelectContent>{coords.data?.coordinators.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.name}{c.is_me ? " (you)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {warnings.length ? <Alert variant="destructive"><AlertTitle>Donor-specific content</AlertTitle><AlertDescription>{warnings.join(" ")} Fact items must not contain donor-specific content. A draft with this cannot be approved.</AlertDescription></Alert> : null}
            {formError ? <FieldError>{formError}</FieldError> : null}
          </FieldGroup>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button disabled={!complete} onClick={save}>Save draft</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg?.kind === "reverify"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Re-verify</DialogTitle><DialogDescription>Updates the source and verified date, and creates a new version that needs approval. The item stays hidden from callers until then.</DialogDescription></DialogHeader>
          <FieldGroup>
            <Field><FieldLabel htmlFor="rs">Source</FieldLabel><Input id="rs" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="rv">Verified on</FieldLabel><Input id="rv" type="date" value={form.verified_on} onChange={(e) => setForm({ ...form, verified_on: e.target.value })} /></Field>
            {formError ? <FieldError>{formError}</FieldError> : null}
          </FieldGroup>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button disabled={!form.source.trim() || !form.verified_on} onClick={reverify}>Save re-verification</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg?.kind === "review"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="sm:max-w-2xl">
          {dlg?.kind === "review" ? (
            <>
              <DialogHeader><DialogTitle>Review draft v{dlg.item.draft!.version}</DialogTitle><DialogDescription>Compare against the approved version that callers see now. Drafted by {dlg.item.draft!.created_by}.</DialogDescription></DialogHeader>
              <Diff before={dlg.item.approved?.text ?? ""} after={dlg.item.draft!.text} />
              <div className="text-xs text-muted-foreground">Source: {dlg.item.approved?.source ?? "—"} → {dlg.item.draft!.source}. Verified: {dlg.item.approved?.verified_on ?? "—"} → {dlg.item.draft!.verified_on}.</div>
              {dlg.item.draft!.created_by_id === myId ? <Alert><AlertDescription>You drafted this. With more than one coordinator, a second coordinator must approve it. With one, it is recorded as a self-approval.</AlertDescription></Alert> : null}
              <Textarea aria-label="Approval note" placeholder="Approval note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              {formError ? <FieldError>{formError}</FieldError> : null}
              <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Close</Button><Button onClick={() => approve(dlg.sheet, dlg.item)}>Approve this version</Button></DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
