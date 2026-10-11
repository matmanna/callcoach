import { LoadState, PageHeader, fmtDate } from "@/components/dash/bits";
import { InviteDialog } from "@/components/dash/InviteDialog";
import { JoinCodeCard } from "@/components/dash/JoinCodeCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Invites } from "@/pages/coordinator/Invites";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { flattenTeams, useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useTeamScope, withQuery } from "@/lib/teamScope";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

interface Vol {
  membership_id: string;
  user_id: string;
  name: string;
  email: string;
  role: "caller" | "coordinator";
  team_id: string;
  team: string;
  team_focus: string;
  status: "active" | "removed";
  joined_at: string;
  calls_logged_30d: number;
  follow_ups_open: number;
  overdue: number;
  last_activity: string | null;
}

// Sorting is limited to these keys. There is no performance sort, by design.
const SORTS = [["name", "Name"], ["team", "Team"], ["joined", "Joined date"], ["last_activity", "Last activity"]] as const;

export function VolunteersPage() {
  const scope = useTeamScope();
  const { me } = useSession();
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState("asc");
  const [status, setStatus] = useState("active");
  const { data, error, loading, reload } = useApi<{ volunteers: Vol[] }>(withQuery("/volunteers", scope.q, `sort=${sort}`, `dir=${dir}`, `status=${status}`));
  const teams = flattenTeams(me?.teams ?? []).filter((t) => t.role === "coordinator");
  const [inviteOpen, setInviteOpen] = useState(false);
  // Invites go to the team in scope, or the first team you coordinate when the scope is "all teams".
  const inviteTeam = scope.team !== "all" ? scope.team : (teams[0]?._id ?? "");
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <>
      <PageHeader
        title="Volunteers"
        description="Everyone on the teams in scope: roles, invitations, and removals. No rankings: sorting is by name, team, joined date, or last activity only."
        actions={<Button size="sm" onClick={() => setInviteOpen(true)} disabled={!inviteTeam}>Invite</Button>}
      />
      <div className="mb-3 flex flex-wrap gap-3">
        <Select value={`${sort}:${dir}`} onValueChange={(v) => { const [s, d] = v.split(":"); setSort(s!); setDir(d!); }}>
          <SelectTrigger className="w-52" aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORTS.flatMap(([k, l]) => [<SelectItem key={`${k}:asc`} value={`${k}:asc`}>{l} (ascending)</SelectItem>, <SelectItem key={`${k}:desc`} value={`${k}:desc`}>{l} (descending)</SelectItem>])}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="removed">Removed</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
        </Select>
      </div>
      <LoadState loading={loading} error={error}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Team</TableHead><TableHead>Focus</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead>
                <TableHead>Calls logged (30 days)</TableHead><TableHead>Follow-ups open</TableHead><TableHead>Overdue</TableHead><TableHead>Last activity</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.volunteers.map((v) => (
                <TableRow key={v.membership_id}>
                  <TableCell><Link className="underline" to={scope.link(`/coordinator/volunteers/${v.user_id}`)}>{v.name || v.email}</Link></TableCell>
                  <TableCell><Badge variant="outline">{v.role}</Badge></TableCell>
                  <TableCell>{v.team}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{v.team_focus}</TableCell>
                  <TableCell><Badge variant={v.status === "active" ? "secondary" : "outline"}>{v.status}</Badge></TableCell>
                  <TableCell>{fmtDate(v.joined_at)}</TableCell>
                  <TableCell>{v.calls_logged_30d}</TableCell>
                  <TableCell>{v.follow_ups_open}</TableCell>
                  <TableCell>{v.overdue}</TableCell>
                  <TableCell>{fmtDate(v.last_activity)}</TableCell>
                  <TableCell className="space-x-1 text-right">
                    {v.status === "active" ? (
                      <>
                        <Select value="" onValueChange={(to) => act(() => api(`/volunteers/${v.membership_id}/reassign`, { body: { to_team_id: to } }), "Reassigned")}>
                          <SelectTrigger className="inline-flex h-8 w-32" aria-label={`Reassign ${v.name}`}><SelectValue placeholder="Reassign" /></SelectTrigger>
                          <SelectContent>{teams.filter((t) => t._id !== v.team_id).map((t) => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                        {v.user_id !== me?.user.id ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => act(() => api(`/memberships/${v.membership_id}`, { method: "PATCH", body: { role: v.role === "caller" ? "coordinator" : "caller" } }), "Role changed")}>
                              Make {v.role === "caller" ? "coordinator" : "caller"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => act(() => api(`/memberships/${v.membership_id}/remove`, { body: {} }), "Removed")}>Remove</Button>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {data && !data.volunteers.length ? <TableRow><TableCell colSpan={11} className="text-muted-foreground">No members.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </LoadState>
      <div className="mt-6"><JoinCodeCard /></div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
          <CardDescription>Invitations that have not been accepted yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <Invites />
        </CardContent>
      </Card>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} defaultTeamId={inviteTeam} onCreated={reload} />
    </>
  );
}
