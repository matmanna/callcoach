import { CellText, LoadState, PageHeader, cellValue, type Cell } from "@/components/dash/bits";
import { SeriesChart } from "@/components/dash/charts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useParams } from "react-router";
import { RubricBreakdown } from "@/components/dash/RubricPanel";
import { ActivityHeatmap } from "@/components/dash/ActivityHeatmap";

interface Trend {
  label: string;
  volunteer: { user_id: string; name: string; teams: string[] };
  series: Array<{ week: string; calls_logged: number; follow_ups_closed: number; follow_ups_closed_on_time: number; logs_edited_before_approval: number }>;
  team_baseline: Array<{ week: string; calls_logged: Cell; callers: Cell }>;
  warmth: { own: Array<{ at: string; volunteer_score: number; model_score: number | null }>; team_volunteer_ratings: Array<{ score_level: number; ratings: Cell }>; team_model_ratings: Array<{ score_level: number; ratings: Cell }> };
  matched_segments: Array<{ segment: string; volunteer: { calls: Cell; reached: Cell }; team: { calls: Cell; reached: Cell } }>;
}

export function VolunteerDetailPage() {
  const { id = "" } = useParams();
  const scope = useTeamScope();
  const { data, error, loading } = useApi<Trend>(withQuery(`/volunteers/${id}/trend`, scope.q));
  const weekly = data?.series.map((s, i) => ({ week: s.week.slice(5), "Calls logged": s.calls_logged, "Team calls (all callers)": cellValue(data.team_baseline[i]?.calls_logged), "Follow-ups closed on time": s.follow_ups_closed_on_time, "Logs edited before approval": s.logs_edited_before_approval }));
  return (
    <LoadState loading={loading} error={error}>
      {data ? (
        <>
          <PageHeader title={data.volunteer.name || "Volunteer"} description={data.volunteer.teams.join(", ")} />
          <Alert className="mb-4"><AlertDescription className="font-medium">{data.label}</AlertDescription></Alert>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Calls logged per week</CardTitle><CardDescription>Their own series, with the team's total beside it. Team weeks under 5 calls are not plotted.</CardDescription></CardHeader>
              <CardContent>
                <SeriesChart kind="line" x="week" data={weekly ?? []} series={[{ key: "Calls logged", label: "Calls logged" }, { key: "Team calls (all callers)", label: "Team calls (all callers)" }]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Follow-ups and edits</CardTitle><CardDescription>Follow-ups closed on time, and logs edited before approval, per week.</CardDescription></CardHeader>
              <CardContent>
                <SeriesChart x="week" data={weekly ?? []} series={[{ key: "Follow-ups closed on time", label: "Follow-ups closed on time" }, { key: "Logs edited before approval", label: "Logs edited before approval" }]} />
              </CardContent>
            </Card>
          </div>
          <div className="mt-4"><ActivityHeatmap path={`/volunteers/${id}/activity`} title="Calling activity" description="Approved calls per day over the last year. Counts under 5 are not shown." /></div>
          <div className="mt-4"><RubricBreakdown path={`/volunteers/${id}/rubric`} /></div>
          <Card className="mt-4">
            <CardHeader><CardTitle>Warmth ratings</CardTitle><CardDescription>The volunteer's own series. The caller's and the model's ratings are shown separately and are never averaged together.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Caller's rating</TableHead><TableHead>Model's rating (suggested, needs review)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.warmth.own.map((r, i) => <TableRow key={i}><TableCell>{new Date(r.at).toLocaleDateString()}</TableCell><TableCell>{r.volunteer_score}</TableCell><TableCell>{r.model_score ?? "—"}</TableCell></TableRow>)}
                  {!data.warmth.own.length ? <TableRow><TableCell colSpan={3} className="text-muted-foreground">No ratings in this period.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
              <div>
                <h3 className="mb-1 text-sm font-medium">Team baseline (all callers on these teams)</h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Caller ratings</TableHead><TableHead>Model ratings</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.warmth.team_volunteer_ratings.map((r, i) => (
                      <TableRow key={r.score_level}><TableCell>{r.score_level}</TableCell><TableCell><CellText cell={r.ratings} /></TableCell><TableCell><CellText cell={data.warmth.team_model_ratings[i]?.ratings} /></TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader><CardTitle>Matched by donor mix</CardTitle><CardDescription>Calls reached, within the same kind of donor, for this volunteer and for the team. For discussion.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Donor mix</TableHead><TableHead>Volunteer: calls</TableHead><TableHead>Volunteer: reached</TableHead><TableHead>Team: calls</TableHead><TableHead>Team: reached</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.matched_segments.map((m) => (
                    <TableRow key={m.segment}><TableCell>{m.segment.replace("_", "-")}</TableCell><TableCell><CellText cell={m.volunteer.calls} /></TableCell><TableCell><CellText cell={m.volunteer.reached} /></TableCell><TableCell><CellText cell={m.team.calls} /></TableCell><TableCell><CellText cell={m.team.reached} /></TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </LoadState>
  );
}
