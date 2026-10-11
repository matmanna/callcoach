import type { LogFields } from "@sc/shared";
import { LoadState, PageHeader, fmtDate, fmtDateTime } from "@/components/dash/bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useParams } from "react-router";
import { CallRubric, useOrgRubric } from "@/components/dash/RubricPanel";

interface Fields { outcome: string; donor_stated_reason: string; preference: string; follow_up: { needed: boolean; action: string; due_date: string | null }; flags: string[] }
interface Call {
  id: string; donor_ref: string; caller: string; team: string; status: string; approved_at: string | null; created_at: string;
  approved: Fields | null;
  draft_history: { model_draft: string; edited_before_approval: boolean };
  warmth: { volunteer_score: number; model_score: number | null; model_reason: string | null; gap: number | null } | null;
  follow_ups: Array<{ id: string; action: string; status: string; due_date: string | null; owner: string }>;
  flags: Array<{ id: string; label: string; status: string }>;
  audit: Array<{ id: string; action: string; who: string; ts: string; note: string | null }>;
}

export function CallDetailPage() {
  const { id = "" } = useParams();
  const rubricItems = useOrgRubric();
  const scope = useTeamScope();
  const { data, error, loading } = useApi<Call>(withQuery(`/calls/${id}`, scope.q));
  return (
    <LoadState loading={loading} error={error}>
      {data ? (
        <>
          <PageHeader title={`Call with ${data.donor_ref}`} description={<>{data.caller}, {data.team}. {data.approved_at ? `Approved ${fmtDateTime(data.approved_at)}` : `Started ${fmtDate(data.created_at)}, pending approval`}.</>} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Approved log</CardTitle><CardDescription>Fields only. No note text exists to show.</CardDescription></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.approved ? (
                  <>
                    <div>Outcome: <b>{data.approved.outcome.replace("_", " ")}</b></div>
                    <div>Reason: {data.approved.donor_stated_reason || "—"}</div>
                    <div>Preference: {data.approved.preference.replace("_", " ")}</div>
                    <div>Follow-up: {data.approved.follow_up.needed ? `${data.approved.follow_up.action} (due ${data.approved.follow_up.due_date ?? "no date"})` : "none"}</div>
                    <div className="flex gap-1">Flags: {data.approved.flags.length ? data.approved.flags.map((f) => <Badge key={f} variant="outline">{f}</Badge>) : "none"}</div>
                  </>
                ) : <p className="text-muted-foreground">Not approved yet.</p>}
                <div className="pt-2 text-xs text-muted-foreground">Draft: model fields {data.draft_history.model_draft}; {data.draft_history.edited_before_approval ? "edited before approval" : "approved as drafted"}.</div>
              </CardContent>
            </Card>
            <CallRubric items={rubricItems} fields={data.approved as LogFields | null} title="Rubric for this call" />
            <Card>
              <CardHeader><CardTitle>Warmth</CardTitle><CardDescription>Caller's and model's ratings, shown separately. Never averaged.</CardDescription></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.warmth ? (
                  <>
                    <div>Caller's rating: <b>{data.warmth.volunteer_score}</b></div>
                    <div>Model's rating (suggested, needs review): <b>{data.warmth.model_score ?? "unavailable"}</b> {data.warmth.model_reason ? `— ${data.warmth.model_reason}` : ""}</div>
                    {data.warmth.gap !== null && data.warmth.gap >= 2 ? <p className="pt-1 italic">Caller and model read this differently. What did you see?</p> : null}
                  </>
                ) : <p className="text-muted-foreground">No rating submitted.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Follow-ups and flags</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.follow_ups.map((f) => <div key={f.id}>{f.action} — {f.owner}, {f.status}, due {f.due_date ?? "no date"}</div>)}
                {data.flags.map((f) => <div key={f.id}><Badge variant="outline">{f.label}</Badge> {f.status}</div>)}
                {!data.follow_ups.length && !data.flags.length ? <p className="text-muted-foreground">None.</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.audit.map((a) => <TableRow key={a.id}><TableCell>{fmtDateTime(a.ts)}</TableCell><TableCell>{a.who}</TableCell><TableCell>{a.action}{a.note ? ` (${a.note})` : ""}</TableCell></TableRow>)}
                    {!data.audit.length ? <TableRow><TableCell colSpan={3} className="text-muted-foreground">No audit rows for this call.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </LoadState>
  );
}
