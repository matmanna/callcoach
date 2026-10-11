import { CellText, DonorMix, LoadState, PageHeader, RangeNote, cellValue, type Cell } from "@/components/dash/bits";
import { SeriesChart } from "@/components/dash/charts";
import { Masonry } from "@/components/dash/Masonry";
import { ActivityHeatmap } from "@/components/dash/ActivityHeatmap";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, errorMessage } from "@/lib/api";
import { flattenTeams, useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";
import { toast } from "sonner";

type Mix = Record<"first_time" | "lapsed" | "recent", Cell>;
interface Meta { range: { from: string; to: string }; denominator: { what: string; count: Cell }; donor_mix: Mix; note: string }
const OUTCOMES = ["reached", "voicemail", "no_answer", "declined", "rescheduled"] as const;
const label = (s: string) => s.replace(/_/g, " ");

function useChart<T>(kind: string, range: string, extra?: string) {
  const scope = useTeamScope();
  return useApi<T & Meta>(withQuery("/insights/charts", `kind=${kind}`, scope.q, range, extra));
}

function Block({ title, description, state, children }: { title: string; description: string; state: { loading: boolean; error: string | null; data: Meta | null }; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <LoadState loading={state.loading} error={state.error}>
          {children}
          {state.data ? <><RangeNote meta={state.data} /><DonorMix mix={state.data.donor_mix} /></> : null}
        </LoadState>
      </CardContent>
    </Card>
  );
}

function CallsPerWeek({ range }: { range: string }) {
  type R = { rows: Array<{ week: string; team: string; outcomes: Record<string, Cell>; total: Cell }> };
  const [split, setSplit] = useState(false);
  const s = useChart<R>("calls_per_week", range, split ? "split=team" : undefined);
  const byWeek = new Map<string, Record<string, number | string | undefined>>();
  for (const r of s.data?.rows ?? []) {
    const row = byWeek.get(r.week) ?? { week: r.week.slice(5) };
    for (const o of OUTCOMES) {
      const v = cellValue(r.outcomes[o]);
      if (v !== undefined) row[o] = ((row[o] as number | undefined) ?? 0) + v;
    }
    byWeek.set(r.week, row);
  }
  return (
    <Block title="Calls per week, by outcome" description="Approved call logs by week. Segments under 5 are not drawn; see the table." state={s}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Split by team (smaller segments are more likely to be suppressed)</label>
      <SeriesChart x="week" data={[...byWeek.values()]} series={OUTCOMES.map((o) => ({ key: o, label: label(o) }))} />
      <Table>
        <TableHeader><TableRow><TableHead>Week</TableHead><TableHead>Team</TableHead>{OUTCOMES.map((o) => <TableHead key={o}>{label(o)}</TableHead>)}<TableHead>Total</TableHead></TableRow></TableHeader>
        <TableBody>{s.data?.rows.map((r, i) => <TableRow key={i}><TableCell>{r.week}</TableCell><TableCell>{r.team}</TableCell>{OUTCOMES.map((o) => <TableCell key={o}><CellText cell={r.outcomes[o]} /></TableCell>)}<TableCell><CellText cell={r.total} /></TableCell></TableRow>)}</TableBody>
      </Table>
    </Block>
  );
}

function FollowUpCompletion({ range }: { range: string }) {
  type R = { rows: Array<{ week: string; created: Cell; completed: Cell; completion_rate: number | { suppressed: true }; median_days_to_close: number | { suppressed: true } }> };
  const s = useChart<R>("follow_up_completion", range);
  const num = (v: number | { suppressed: true }) => (typeof v === "number" ? v : undefined);
  return (
    <Block title="Follow-up completion" description="Follow-ups created each week, how many were completed, and the median days to close." state={s}>
      <SeriesChart kind="line" x="week" data={(s.data?.rows ?? []).map((r) => ({ week: r.week.slice(5), "Completion rate (%)": num(r.completion_rate), "Median days to close": num(r.median_days_to_close) }))} series={[{ key: "Completion rate (%)", label: "Completion rate (%)" }, { key: "Median days to close", label: "Median days to close" }]} />
      <Table>
        <TableHeader><TableRow><TableHead>Week</TableHead><TableHead>Created</TableHead><TableHead>Completed</TableHead><TableHead>Completion rate</TableHead><TableHead>Median days to close</TableHead></TableRow></TableHeader>
        <TableBody>{s.data?.rows.map((r) => <TableRow key={r.week}><TableCell>{r.week}</TableCell><TableCell><CellText cell={r.created} /></TableCell><TableCell><CellText cell={r.completed} /></TableCell><TableCell>{typeof r.completion_rate === "number" ? `${r.completion_rate}%` : <CellText cell={r.completion_rate} />}</TableCell><TableCell>{typeof r.median_days_to_close === "number" ? r.median_days_to_close : <CellText cell={r.median_days_to_close} />}</TableCell></TableRow>)}</TableBody>
      </Table>
    </Block>
  );
}

function Preferences({ range }: { range: string }) {
  type R = { rows: Array<{ campaign: string; logs: Cell; preferences: Record<string, Cell> }>; preferences: string[] };
  const s = useChart<R>("preference_reports", range);
  const prefs = s.data?.preferences ?? ["stop_calls", "email_preferred", "call_later"];
  return (
    <Block title="Reported preferences by campaign" description="What donors reported, as logged: stop calls, email preferred, call later." state={s}>
      <SeriesChart x="campaign" data={(s.data?.rows ?? []).map((r) => ({ campaign: r.campaign, ...Object.fromEntries(prefs.map((p) => [p, cellValue(r.preferences[p])])) }))} series={prefs.map((p) => ({ key: p, label: label(p) }))} />
      <Table>
        <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Logs</TableHead>{prefs.map((p) => <TableHead key={p}>{label(p)}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{s.data?.rows.map((r) => <TableRow key={r.campaign}><TableCell>{r.campaign}</TableCell><TableCell><CellText cell={r.logs} /></TableCell>{prefs.map((p) => <TableCell key={p}><CellText cell={r.preferences[p]} /></TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </Block>
  );
}

function OverdueTrend({ range }: { range: string }) {
  type R = { rows: Array<{ week: string; overdue: Cell }> };
  const s = useChart<R>("overdue_trend", range);
  return (
    <Block title="Overdue follow-ups over time" description="Open follow-ups past their due date at the end of each week." state={s}>
      <SeriesChart kind="line" x="week" data={(s.data?.rows ?? []).map((r) => ({ week: r.week.slice(5), Overdue: cellValue(r.overdue) }))} series={[{ key: "Overdue", label: "Overdue" }]} />
      <Table>
        <TableHeader><TableRow><TableHead>Week starting</TableHead><TableHead>Overdue at week end</TableHead></TableRow></TableHeader>
        <TableBody>{s.data?.rows.map((r) => <TableRow key={r.week}><TableCell>{r.week}</TableCell><TableCell><CellText cell={r.overdue} /></TableCell></TableRow>)}</TableBody>
      </Table>
    </Block>
  );
}

function Warmth({ range }: { range: string }) {
  type L = { level: number; count: Cell };
  type R = { rows: Array<{ campaign: string; ratings: Cell; caller_ratings: L[]; model_ratings: L[] }> };
  const s = useChart<R>("warmth_distribution", range);
  return (
    <Block title="Warmth ratings by campaign" description="Team level only. The caller's and the model's ratings are separate distributions and are never averaged. Model ratings are suggested and need review." state={s}>
      {s.data?.rows.map((r) => (
        <div key={r.campaign}>
          <h3 className="mb-1 text-sm font-medium">{r.campaign} (<CellText cell={r.ratings} /> ratings)</h3>
          <SeriesChart x="level" data={[1, 2, 3, 4, 5].map((l) => ({ level: String(l), "Caller's ratings": cellValue(r.caller_ratings[l - 1]?.count), "Model's ratings": cellValue(r.model_ratings[l - 1]?.count) }))} series={[{ key: "Caller's ratings", label: "Caller's ratings" }, { key: "Model's ratings", label: "Model's ratings" }]} />
          <Table>
            <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Caller</TableHead><TableHead>Model</TableHead></TableRow></TableHeader>
            <TableBody>{r.caller_ratings.map((c, i) => <TableRow key={c.level}><TableCell>{c.level}</TableCell><TableCell><CellText cell={c.count} /></TableCell><TableCell><CellText cell={r.model_ratings[i]?.count} /></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
      ))}
      {s.data && !s.data.rows.length ? <p className="text-sm text-muted-foreground">No ratings in this range.</p> : null}
    </Block>
  );
}

interface Seg { segment: string; calls: Cell; outcomes: Record<string, Cell>; total: Cell; donor_mix: Mix }
function CallLength({ range }: { range: string }) {
  type Len = { minutes: number } | { suppressed: true };
  type R = {
    buckets: string[];
    outcomes: string[];
    rows: Array<{ bucket: string; calls: Cell; outcomes: Record<string, Cell> }>;
    median_minutes_by_outcome: Record<string, Len>;
  };
  const s = useChart<R>("call_length", range);
  const bucketLabel: Record<string, string> = { under_2: "Under 2 min", "2_to_5": "2 to 5 min", "5_to_10": "5 to 10 min", over_10: "Over 10 min" };
  const outcomes = s.data?.outcomes ?? [];
  return (
    <Block title="Call length" description="Approved calls that have a recorded length, grouped by length and outcome. Calls without a length are left out." state={s}>
      <SeriesChart x="bucket" data={(s.data?.rows ?? []).map((r) => ({ bucket: bucketLabel[r.bucket] ?? r.bucket, ...Object.fromEntries(outcomes.map((o) => [o, cellValue(r.outcomes[o])])) }))} series={outcomes.map((o) => ({ key: o, label: label(o) }))} />
      <Table>
        <TableHeader><TableRow><TableHead>Length</TableHead><TableHead>Calls</TableHead>{outcomes.map((o) => <TableHead key={o}>{label(o)}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{s.data?.rows.map((r) => <TableRow key={r.bucket}><TableCell>{bucketLabel[r.bucket] ?? r.bucket}</TableCell><TableCell><CellText cell={r.calls} /></TableCell>{outcomes.map((o) => <TableCell key={o}><CellText cell={r.outcomes[o]} /></TableCell>)}</TableRow>)}</TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        Median length by outcome:{" "}
        {outcomes.map((o, i) => {
          const m = s.data?.median_minutes_by_outcome[o];
          return (
            <span key={o}>
              {i ? " · " : ""}
              {label(o)}: {m && "minutes" in m ? `${m.minutes} min` : "suppressed (under 5)"}
            </span>
          );
        })}
      </p>
    </Block>
  );
}

function Effectiveness({ range }: { range: string }) {
  type R = { rows: Array<{ campaign: string; calls: Cell; reached_rate: number | { suppressed: true }; follow_up_rate: number | { suppressed: true }; median_minutes: { minutes: number } | { suppressed: true } }> };
  const s = useChart<R>("effectiveness", range);
  const pct = (v: number | { suppressed: true }) => (typeof v === "number" ? v : undefined);
  return (
    <Block title="Effectiveness by campaign" description="How often a call reached the donor, how often it led to a follow-up, and the median call length. Rates are shown only for groups of 5 or more calls." state={s}>
      <SeriesChart x="campaign" data={(s.data?.rows ?? []).map((r) => ({ campaign: r.campaign, "Reached (%)": pct(r.reached_rate), "Follow-up needed (%)": pct(r.follow_up_rate) }))} series={[{ key: "Reached (%)", label: "Reached (%)" }, { key: "Follow-up needed (%)", label: "Follow-up needed (%)" }]} />
      <Table>
        <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Calls</TableHead><TableHead>Reached</TableHead><TableHead>Follow-up needed</TableHead><TableHead>Median length</TableHead></TableRow></TableHeader>
        <TableBody>{s.data?.rows.map((r) => <TableRow key={r.campaign}><TableCell>{r.campaign}</TableCell><TableCell><CellText cell={r.calls} /></TableCell><TableCell>{typeof r.reached_rate === "number" ? `${r.reached_rate}%` : <CellText cell={r.reached_rate} />}</TableCell><TableCell>{typeof r.follow_up_rate === "number" ? `${r.follow_up_rate}%` : <CellText cell={r.follow_up_rate} />}</TableCell><TableCell>{"minutes" in r.median_minutes ? `${r.median_minutes.minutes} min` : <CellText cell={r.median_minutes} />}</TableCell></TableRow>)}</TableBody>
      </Table>
    </Block>
  );
}

function Compare({ range }: { range: string }) {
  const scope = useTeamScope();
  const { me } = useSession();
  const camps = useApi<{ campaigns: Array<{ _id: string; name: string }> }>("/campaigns");
  const teams = flattenTeams(me?.teams ?? []).filter((t) => t.role === "coordinator" && t.depth > 0);
  const [kind, setKind] = useState<"campaign" | "time_band" | "team">("campaign");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const BANDS = ["00-03", "03-06", "06-09", "09-12", "12-15", "15-18", "18-21", "21-24"];
  const options: Array<[string, string]> = kind === "campaign" ? (camps.data?.campaigns.map((c) => [c.name, c.name]) ?? []) : kind === "team" ? teams.map((t) => [t._id, t.name]) : BANDS.map((x) => [x, x]);
  const ready = a && b && a !== b;
  const s = useApi<Meta & { segments: Seg[] }>(ready ? withQuery("/insights/compare", `kind=${kind}`, `a=${encodeURIComponent(a)}`, `b=${encodeURIComponent(b)}`, scope.q, range) : null);
  const name = (v: string) => options.find(([k]) => k === v)?.[1] ?? v;
  return (
    <Card>
      <CardHeader><CardTitle>Segment comparison</CardTitle><CardDescription>Two segments side by side, each with its donor mix, so differences are not mistaken for caller effects.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Select value={kind} onValueChange={(v) => (setKind(v as typeof kind), setA(""), setB(""))}><SelectTrigger className="w-40" aria-label="Compare by"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="campaign">Campaigns</SelectItem><SelectItem value="time_band">Time bands</SelectItem><SelectItem value="team">Teams</SelectItem></SelectContent></Select>
          {[[a, setA, "First segment"], [b, setB, "Second segment"]].map(([v, set, lab]) => (
            <Select key={lab as string} value={v as string} onValueChange={set as (x: string) => void}><SelectTrigger className="w-52" aria-label={lab as string}><SelectValue placeholder={lab as string} /></SelectTrigger><SelectContent>{options.map(([k, n]) => <SelectItem key={k} value={k}>{n}</SelectItem>)}</SelectContent></Select>
          ))}
        </div>
        {!ready ? <p className="text-sm text-muted-foreground">Choose two different segments.</p> : null}
        <LoadState loading={!!ready && s.loading} error={s.error}>
          {s.data ? (
            <>
              <Table>
                <TableHeader><TableRow><TableHead>Outcome</TableHead>{s.data.segments.map((g) => <TableHead key={g.segment}>{name(g.segment)}</TableHead>)}</TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell>Calls</TableCell>{s.data.segments.map((g) => <TableCell key={g.segment}><CellText cell={g.calls} /></TableCell>)}</TableRow>
                  {OUTCOMES.map((o) => <TableRow key={o}><TableCell>{label(o)}</TableCell>{s.data!.segments.map((g) => <TableCell key={g.segment}><CellText cell={g.outcomes[o]} /></TableCell>)}</TableRow>)}
                  {(["first_time", "lapsed", "recent"] as const).map((m) => <TableRow key={m}><TableCell className="text-muted-foreground">Donor mix: {label(m)}</TableCell>{s.data!.segments.map((g) => <TableCell key={g.segment}><CellText cell={g.donor_mix[m]} /></TableCell>)}</TableRow>)}
                </TableBody>
              </Table>
              <RangeNote meta={s.data} />
            </>
          ) : null}
        </LoadState>
      </CardContent>
    </Card>
  );
}

interface Pattern { id: string; title: string; description: string; segment: string; denominator: number; date_from: string; date_to: string; status: "proposed" | "approved" | "retired" }
function SharedPatterns() {
  const scope = useTeamScope();
  const { data, error, loading, reload } = useApi<{ patterns: Pattern[] }>(withQuery("/patterns", scope.q));
  const decide = async (id: string, action: "approve" | "retire") => {
    try {
      await api(withQuery(`/patterns/${id}/decision`, scope.q), { body: { action } });
      toast.success(action === "approve" ? "Pattern approved" : "Pattern retired");
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Shared patterns</CardTitle><CardDescription>Generic patterns with their denominator, date range, and segment. They are never linked to donors. Approve or retire each one.</CardDescription></CardHeader>
      <CardContent>
        <LoadState loading={loading} error={error}>
          <Table>
            <TableHeader><TableRow><TableHead>Pattern</TableHead><TableHead>Segment</TableHead><TableHead>Denominator</TableHead><TableHead>Date range</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data?.patterns.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-sm whitespace-normal"><div className="font-medium">{p.title}</div><div className="text-xs text-muted-foreground">{p.description}</div></TableCell>
                  <TableCell>{p.segment}</TableCell><TableCell>{p.denominator}</TableCell><TableCell>{p.date_from} to {p.date_to}</TableCell>
                  <TableCell><Badge variant={p.status === "approved" ? "secondary" : "outline"}>{p.status}</Badge></TableCell>
                  <TableCell className="space-x-1 text-right">{p.status !== "approved" ? <Button size="sm" onClick={() => decide(p.id, "approve")}>Approve</Button> : null}{p.status !== "retired" ? <Button size="sm" variant="ghost" onClick={() => decide(p.id, "retire")}>Retire</Button> : null}</TableCell>
                </TableRow>
              ))}
              {data && !data.patterns.length ? <TableRow><TableCell colSpan={6} className="text-muted-foreground">No patterns yet.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </LoadState>
      </CardContent>
    </Card>
  );
}

export function InsightsPage() {
  const scope = useTeamScope();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = [from && `from=${from}`, to && `to=${to}`].filter(Boolean).join("&");
  return (
    <>
      <PageHeader title="Patterns" description="Charts compare segments and time, never people. Counts under 5 are suppressed. This describes calls and follow-ups only." />
      <Alert className="mb-3"><AlertDescription>Flags are suggested by rules and model ratings by a model. Both are marked "needs review".</AlertDescription></Alert>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">From<Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">To<Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <span className="pb-2 text-xs text-muted-foreground">{range ? "" : "Default: the last 12 weeks."}</span>
      </div>
      <div className="mb-4">
        <ActivityHeatmap path={withQuery("/activity/heatmap", scope.q)} title="Calling activity by day" description="Approved calls per day over the last year, for the teams in scope. Days under 5 are not counted in the colour." />
      </div>
      <Masonry>
        <CallsPerWeek range={range} />
        <CallLength range={range} />
        <Effectiveness range={range} />
        <FollowUpCompletion range={range} />
        <Preferences range={range} />
        <OverdueTrend range={range} />
        <Warmth range={range} />
      </Masonry>
      <Tabs defaultValue="compare" className="mt-2">
        <TabsList className="flex-wrap">
          <TabsTrigger value="compare">Compare segments</TabsTrigger><TabsTrigger value="shared">Shared patterns</TabsTrigger>
        </TabsList>
        <TabsContent value="compare" className="pt-3"><Compare range={range} /></TabsContent>
        <TabsContent value="shared" className="pt-3"><SharedPatterns /></TabsContent>
      </Tabs>
    </>
  );
}
