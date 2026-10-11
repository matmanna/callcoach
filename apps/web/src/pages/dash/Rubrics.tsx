import { LoadState, PageHeader, fmtDate } from "@/components/dash/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Tag } from "@sc/shared";
import { useState } from "react";
import { toast } from "sonner";

interface RubricItem { id: string; text: string; supporting_tags: string[]; conditional_on_tag?: string | null; weight?: number }
interface Rubric { _id: string; team_id: string | null; version?: number; items: RubricItem[] }
interface Versions { versions: Array<{ version: number; note: string | null; created_at: string; created_by: string; logs_evaluated: number; items: RubricItem[] }> }

export function RubricsPage() {
  const { data, error, loading, reload } = useApi<{ rubrics: Rubric[] }>("/rubrics");
  const [editing, setEditing] = useState<Rubric | null>(null);
  const [items, setItems] = useState<RubricItem[]>([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showId, setShowId] = useState<string | null>(null);
  const versions = useApi<Versions>(showId ? `/rubrics/${showId}/versions` : null);

  const open = (r: Rubric) => (setItems(r.items.map((i) => ({ ...i, supporting_tags: [...i.supporting_tags] }))), setNote(""), setErr(null), setEditing(r));
  const patch = (idx: number, p: Partial<RubricItem>) => setItems(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  const save = async () => {
    try {
      await api(`/rubrics/${editing!._id}`, { method: "PUT", body: { items: items.map((i) => ({ id: i.id, text: i.text, supporting_tags: i.supporting_tags, conditional_on_tag: i.conditional_on_tag ?? null, weight: i.weight ?? 1 })), ...(note.trim() ? { note } : {}) } });
      toast.success("Saved as a new version");
      setEditing(null);
      reload();
      if (showId === editing!._id) versions.reload();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <>
      <PageHeader title="Rubrics" description="Changes create versions. Each version shows how many logs were evaluated against it." />
      <LoadState loading={loading} error={error}>
        {data?.rubrics.map((r) => (
          <Card key={r._id} className="mb-4">
            <CardHeader className="flex-row items-start justify-between">
              <div><CardTitle>{r.team_id ? "Team rubric" : "Organization rubric"} <Badge variant="outline">v{r.version ?? 1}</Badge></CardTitle><CardDescription>{r.items.length} items</CardDescription></div>
              <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setShowId(showId === r._id ? null : r._id)}>{showId === r._id ? "Hide versions" : "Versions"}</Button><Button size="sm" onClick={() => open(r)}>Edit</Button></div>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="list-disc pl-5 text-sm">{r.items.map((i) => <li key={i.id}>{i.text}{i.supporting_tags.length ? <span className="text-muted-foreground"> ({i.supporting_tags.join(", ")})</span> : null}{i.conditional_on_tag ? <span className="text-muted-foreground"> — only when {i.conditional_on_tag}</span> : null}</li>)}</ul>
              {showId === r._id ? (
                <LoadState loading={versions.loading} error={versions.error}>
                  <Table>
                    <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>Saved</TableHead><TableHead>By</TableHead><TableHead>Note</TableHead><TableHead>Logs evaluated</TableHead></TableRow></TableHeader>
                    <TableBody>{versions.data?.versions.map((v) => <TableRow key={v.version}><TableCell>v{v.version}</TableCell><TableCell>{fmtDate(v.created_at)}</TableCell><TableCell>{v.created_by}</TableCell><TableCell>{v.note ?? "—"}</TableCell><TableCell>{v.logs_evaluated}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </LoadState>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {data && !data.rubrics.length ? <p className="text-muted-foreground">No rubrics yet. Import one from Admin, Imports.</p> : null}
      </LoadState>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Edit rubric</DialogTitle><DialogDescription>Saving creates a new version. Earlier versions are kept.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            {items.map((it, idx) => (
              <div key={it.id} className="space-y-2 rounded border p-2">
                <div className="flex items-center gap-2">
                  <Input aria-label={`Item ${idx + 1} text`} value={it.text} onChange={(e) => patch(idx, { text: e.target.value })} />
                  <Label htmlFor={`${it.id}-weight`} className="shrink-0 text-xs">Weight</Label>
                  <Input id={`${it.id}-weight`} type="number" min={0} max={5} step={1} className="w-20" value={it.weight ?? 1} onChange={(e) => patch(idx, { weight: Math.min(5, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {Tag.options.map((t) => (
                    <div key={t} className="flex items-center gap-1 text-xs"><Checkbox id={`${it.id}-${t}`} checked={it.supporting_tags.includes(t)} onCheckedChange={(v) => patch(idx, { supporting_tags: v === true ? [...it.supporting_tags, t] : it.supporting_tags.filter((x) => x !== t) })} /><Label htmlFor={`${it.id}-${t}`} className="text-xs">{t}</Label></div>
                  ))}
                </div>
                <Button size="sm" variant="ghost" disabled={items.length < 2} onClick={() => setItems(items.filter((_, i) => i !== idx))}>Remove item</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setItems([...items, { id: `item-${items.length + 1}-${Date.now().toString(36)}`, text: "", supporting_tags: [] }])}>Add item</Button>
            <Input aria-label="Version note" placeholder="Version note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {err ? <FieldError>{err}</FieldError> : null}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={items.some((i) => !i.text.trim())} onClick={save}>Save new version</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
