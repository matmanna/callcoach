import { LoadState, ModelNote, PageHeader } from "@/components/dash/bits";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { Link } from "react-router";

interface Overview {
  suggested_note: string;
  calls_this_week: { completed: number; approved: number; pending_approval: number };
  queue: { open: number; by_label: Record<string, number>; oldest_age_hours: number | null };
  follow_ups: { open: number; overdue: number; due_this_week: number };
  escalations: { awaiting_decision: number };
  fact_sheet_health: { approved: number; draft: number; stale: number };
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function OverviewPage() {
  const scope = useTeamScope();
  const { data, error, loading } = useApi<Overview>(withQuery("/dashboard/overview", scope.q));
  const card = (to: string, title: string, desc: string, body: React.ReactNode) => (
    <Link to={scope.link(to)} className="block">
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </Link>
  );
  return (
    <>
      <PageHeader title="Overview" description={<ModelNote />} />
      <LoadState loading={loading} error={error}>
        {data ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {card("/coordinator/calls?tab=logs", "Calls this week", "From Monday", (
              <div className="flex gap-6">
                <Stat label="completed" value={data.calls_this_week.completed} />
                <Stat label="approved" value={data.calls_this_week.approved} />
                <Stat label="pending approval" value={data.calls_this_week.pending_approval} />
              </div>
            ))}
            {card("/coordinator/calls?tab=queue", "Coordinator queue", "Proposed flags awaiting a decision", (
              <div className="space-y-2">
                <div className="flex gap-6">
                  <Stat label="open" value={data.queue.open} />
                  <Stat label="oldest (hours)" value={data.queue.oldest_age_hours ?? "—"} />
                </div>
                <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                  {Object.entries(data.queue.by_label).map(([l, n]) => (
                    <span key={l}>{l.replace(/_/g, " ").toLowerCase()}: {n}</span>
                  ))}
                </div>
              </div>
            ))}
            {card("/coordinator/calls?tab=follow-ups", "Follow-ups", "In each team's time zone", (
              <div className="flex gap-6">
                <Stat label="open" value={data.follow_ups.open} />
                <Stat label="overdue" value={data.follow_ups.overdue} />
                <Stat label="due this week" value={data.follow_ups.due_this_week} />
              </div>
            ))}
            {card("/coordinator/calls?tab=queue", "Escalations", "Distress and stop-contact flags awaiting a decision", <Stat label="awaiting a decision" value={data.escalations.awaiting_decision} />)}
            {card("/coordinator/knowledge?tab=fact-sheets", "Fact sheet health", "Stale items are hidden from callers", (
              <div className="flex gap-6">
                <Stat label="approved" value={data.fact_sheet_health.approved} />
                <Stat label="draft" value={data.fact_sheet_health.draft} />
                <Stat label="stale" value={data.fact_sheet_health.stale} />
              </div>
            ))}
          </div>
        ) : null}
      </LoadState>
    </>
  );
}
