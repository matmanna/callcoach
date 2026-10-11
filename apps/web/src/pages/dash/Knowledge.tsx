import { LoadState, PageHeader, fmtDate } from "@/components/dash/bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";
import { toast } from "sonner";

interface Entry { _id: string; type: string; title: string; body: string; status: "draft" | "published" | "retired"; version: number; author: string; updated_at: string }
const TYPES = ["process", "campaign", "guidance", "handoff"] as const;

export function KnowledgePage() {
  const scope = useTeamScope();
  const { data, error, loading, reload } = useApi<{ entries: Entry[] }>(withQuery("/knowledge", scope.q));
  const [dlg, setDlg] = useState<{ entry?: Entry } | null>(null);
  const [form, setForm] = useState({ type: "guidance", title: "", body: "" });
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  const open = (entry?: Entry) => (setForm({ type: entry?.type ?? "guidance", title: entry?.title ?? "", body: entry?.body ?? "" }), setErr(null), setWarn([]), setDlg({ ...(entry ? { entry } : {}) }));
  const save = async () => {
    try {
      const r = dlg?.entry
        ? await api<{ warnings: string[] }>(withQuery(`/knowledge/${dlg.entry._id}`, scope.q), { method: "PATCH", body: { title: form.title, body: form.body } })
        : await api<{ warnings: string[] }>(withQuery("/knowledge", scope.q), { body: { type: form.type, title: form.title, body: form.body } });
      if (r.warnings.length) setWarn(r.warnings);
      toast.success("Saved as a draft");
      setDlg(null);
      reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const act = async (id: string, what: "publish" | "retire") => {
    try {
      await api(withQuery(`/knowledge/${id}/${what}`, scope.q), { body: {} });
      toast.success(what === "publish" ? "Published" : "Retired");
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      <PageHeader title="Knowledge entries" description="Process, campaign, guidance, and handoff notes. Drafts become visible only when a coordinator publishes them; publishing is audited." actions={<Button onClick={() => open()}>New entry</Button>} />
      <LoadState loading={loading} error={error}>
        <Table>
          <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead><TableHead>Author</TableHead><TableHead>Updated</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {data?.entries.map((e) => (
              <TableRow key={e._id}>
                <TableCell className="max-w-xs whitespace-normal"><div className="font-medium">{e.title}</div><div className="line-clamp-2 text-xs text-muted-foreground">{e.body}</div></TableCell>
                <TableCell>{e.type}</TableCell>
                <TableCell><Badge variant={e.status === "published" ? "secondary" : "outline"}>{e.status}</Badge></TableCell>
                <TableCell>v{e.version}</TableCell><TableCell>{e.author}</TableCell><TableCell>{fmtDate(e.updated_at)}</TableCell>
                <TableCell className="space-x-1 text-right">
                  {e.status !== "retired" ? <Button size="sm" variant="outline" onClick={() => open(e)}>Edit</Button> : null}
                  {e.status === "draft" ? <Button size="sm" onClick={() => act(e._id, "publish")}>Publish</Button> : null}
                  {e.status !== "retired" ? <Button size="sm" variant="ghost" onClick={() => act(e._id, "retire")}>Retire</Button> : null}
                </TableCell>
              </TableRow>
            ))}
            {data && !data.entries.length ? <TableRow><TableCell colSpan={7} className="text-muted-foreground">No entries yet.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </LoadState>
      {warn.length ? <Alert className="mt-3" variant="destructive"><AlertDescription>{warn.join(" ")} This entry cannot be published until the donor-specific content is removed.</AlertDescription></Alert> : null}
      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{dlg?.entry ? "Edit entry" : "New entry"}</DialogTitle><DialogDescription>{dlg?.entry ? "Editing returns a published entry to draft until it is published again." : "Saved as a draft."} Do not include donor-specific content.</DialogDescription></DialogHeader>
          <FieldGroup>
            {!dlg?.entry ? (
              <Field><FieldLabel htmlFor="kt">Type</FieldLabel>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger id="kt" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              </Field>
            ) : null}
            <Field><FieldLabel htmlFor="kn">Title</FieldLabel><Input id="kn" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field><FieldLabel htmlFor="kb">Body</FieldLabel><Textarea id="kb" rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
            {err ? <FieldError>{err}</FieldError> : null}
          </FieldGroup>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button disabled={!form.title.trim() || !form.body.trim()} onClick={save}>Save draft</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
