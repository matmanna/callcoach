import { TeamSelect } from "@/components/TeamSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import type { SeedKind } from "@sc/shared";
import { useState } from "react";
import { toast } from "sonner";

interface Preview {
  headers: string[];
  targets: string[];
  suggested_mapping: Record<string, string>;
  missing_columns: string[];
  total_rows: number;
  valid_rows: number;
  rows: Array<{ row: number; values: Record<string, string>; ok: boolean; reasons: string[]; action?: "insert" | "update" }>;
}
interface SeedRun {
  _id: string;
  row_count: number;
  accepted_count: number;
  updated_count: number;
  rejected_count: number;
  rejected_rows: Array<{ row: number; reasons: string[] }>;
}

const KINDS: Array<{ kind: SeedKind; label: string; accept: string; hint: string }> = [
  { kind: "donors", label: "Donors CSV", accept: ".csv", hint: "external_id, first_name, last_name, spouse_name, employer, town, campaign, gift_band, past_gift_count, last_gift_band, limits (semicolon-separated), team_name" },
  { kind: "gifts", label: "Gifts CSV", accept: ".csv", hint: "external_id, donor_external_id, amount_band, campaign, gift_date (YYYY-MM-DD)" },
  { kind: "fact_sheet", label: "Fact sheet", accept: ".json,.csv", hint: "JSON items or CSV: text, source, verified_on, owner_email. Items import as drafts." },
  { kind: "rubric", label: "Rubric JSON", accept: ".json", hint: '{ "items": [{ "id", "text", "supporting_tags", "conditional_on_tag" }] }' },
];

export function Import() {
  const [kind, setKind] = useState<SeedKind>("donors");
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [updateExisting, setUpdateExisting] = useState(false);
  const [teamId, setTeamId] = useState("none");
  const [campaign, setCampaign] = useState("");
  const [result, setResult] = useState<SeedRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const meta = KINDS.find((k) => k.kind === kind)!;

  const body = (f = file, m = mapping) => ({
    file_name: f!.name,
    content: f!.content,
    mapping: m,
    update_existing: updateExisting,
    ...(kind === "rubric" ? { team_id: teamId === "none" ? null : teamId } : {}),
    ...(kind === "fact_sheet" && campaign.trim() ? { campaign_name: campaign.trim() } : {}),
  });

  const runPreview = async (f = file, m = mapping) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const p = await api<Preview>(`/imports/${kind}/preview`, { body: body(f, m) });
      setPreview(p);
      setMapping(p.suggested_mapping);
    } catch (err) {
      setPreview(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ seed_run: SeedRun }>(`/imports/${kind}/commit`, { body: body() });
      setResult(r.seed_run);
      toast.success(`Imported: ${r.seed_run.accepted_count} new, ${r.seed_run.updated_count} updated, ${r.seed_run.rejected_count} rejected`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = (k: SeedKind) => {
    setKind(k);
    setFile(null);
    setPreview(null);
    setResult(null);
    setMapping({});
    setError(null);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Import data</h1>
      <Alert>
        <AlertTitle>Use synthetic or consented data only.</AlertTitle>
        <AlertDescription>Files with transcript, audio, or raw-notes columns are refused. Every import is recorded and audited.</AlertDescription>
      </Alert>
      <Tabs value={kind} onValueChange={(v) => reset(v as SeedKind)}>
        <TabsList>
          {KINDS.map((k) => (
            <TabsTrigger key={k.kind} value={k.kind}>
              {k.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>1. Upload</CardTitle>
          <CardDescription>{meta.hint}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="file">File</FieldLabel>
              <Input
                id="file"
                type="file"
                accept={meta.accept}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const next = { name: f.name, content: await f.text() };
                  setFile(next);
                  setMapping({});
                  await runPreview(next, {});
                }}
              />
            </Field>
            {kind === "rubric" ? (
              <Field>
                <FieldLabel>Attach to</FieldLabel>
                <TeamSelect value={teamId} onChange={setTeamId} includeNone="Whole organization" />
              </Field>
            ) : null}
            {kind === "fact_sheet" ? (
              <Field>
                <FieldLabel htmlFor="campaign">Campaign (optional)</FieldLabel>
                <Input id="campaign" placeholder="Spring Youth Appeal 2026" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
                <FieldDescription>Links the fact sheet to a campaign so callers see it in that campaign's briefs.</FieldDescription>
              </Field>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Import problem</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Preview</CardTitle>
            <CardDescription>
              {preview.valid_rows} of {preview.total_rows} rows valid. Showing the first {preview.rows.length}. The server validates again on confirm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.targets.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {preview.targets.map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <Label className="w-40 shrink-0 text-xs">{t}</Label>
                    <Select
                      value={mapping[t] ?? "__none"}
                      onValueChange={(v) => {
                        const m = { ...mapping };
                        if (v === "__none") delete m[t];
                        else m[t] = v;
                        setMapping(m);
                        void runPreview(file, m);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">(not mapped)</SelectItem>
                        {preview.headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Status</TableHead>
                    {Object.keys(preview.rows[0]?.values ?? {}).map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                    <TableHead>Reasons</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((r) => (
                    <TableRow key={r.row}>
                      <TableCell>{r.row}</TableCell>
                      <TableCell>{r.ok ? <Badge variant="secondary">{r.action ?? "ok"}</Badge> : <Badge variant="destructive">rejected</Badge>}</TableCell>
                      {Object.keys(preview.rows[0]?.values ?? {}).map((h) => (
                        <TableCell key={h} className="max-w-48 truncate">
                          {r.values[h]}
                        </TableCell>
                      ))}
                      <TableCell className="text-destructive">{r.reasons.join("; ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {kind === "donors" || kind === "gifts" ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="update"
                  checked={updateExisting}
                  onCheckedChange={(v) => {
                    setUpdateExisting(v === true);
                  }}
                />
                <Label htmlFor="update">Update existing records with the same external_id</Label>
                <Button size="sm" variant="ghost" onClick={() => runPreview()}>
                  Re-check
                </Button>
              </div>
            ) : null}
            <Button onClick={commit} disabled={busy || !file}>
              3. Confirm import
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
            <CardDescription>
              {result.accepted_count} accepted, {result.updated_count} updated, {result.rejected_count} rejected of {result.row_count} rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.rejected_rows.map((r) => (
              <div key={r.row} className="text-sm">
                Row {r.row}: <span className="text-destructive">{r.reasons.join("; ")}</span>
              </div>
            ))}
            {result.rejected_count ? (
              <Button variant="outline" asChild>
                <a href={`/api/seed-runs/${result._id}/rejects.csv`}>Download rejected rows (CSV)</a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
