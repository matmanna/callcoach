import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { flattenTeams, useSession } from "@/lib/session";
import type { LogFields } from "@sc/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

interface BriefData {
  donor: { id: string; first_name: string; last_name: string; gift_band: string; past_gift_count: number; last_gift_band: string; campaign: string };
  limits: string[];
  follow_ups: Array<{ _id: string; team_id: string; owner_user_id: string; action: string; due_date: string | null; status: string; overdue: boolean }>;
  last_logs: Array<{ id: string; team_id: string; caller_id: string; fields: LogFields; author: string; approved_at: string }>;
  fact_items: Array<{ id: string; text: string; source: string; verified_on: string; owner: string; stale: boolean }>;
  talking_points: string[];
}

export function Brief() {
  const { donorId } = useParams();
  const navigate = useNavigate();
  const { me } = useSession();
  const [brief, setBrief] = useState<BriefData | null>(null);
  const load = useCallback(async () => {
    if (!donorId) return;
    try { setBrief(await api<BriefData>(`/donors/${donorId}/brief`)); }
    catch (err) { toast.error(errorMessage(err)); }
  }, [donorId]);
  useEffect(() => void load(), [load]);
  if (!brief) return <p>Loading donor brief…</p>;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Brief for {brief.donor.first_name} {brief.donor.last_name}</h1>
        <Button onClick={async () => { try {
          const result = await api<{ log_id: string }>(`/donors/${brief.donor.id}/logs/start`, { body: { call_id: crypto.randomUUID() } });
          navigate(`/call/${brief.donor.id}/post?log=${result.log_id}`);
        } catch (err) { toast.error(errorMessage(err)); } }}>Start call log</Button>
      </div>
      <Card><CardHeader><CardTitle>Donor snapshot</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
        <p>Campaign: {brief.donor.campaign}</p><p>Gift band: {brief.donor.gift_band}</p>
        <p>Past gifts: {brief.donor.past_gift_count}; last gift band: {brief.donor.last_gift_band}</p>
      </CardContent></Card>
      <Alert><AlertTitle>Stated limits</AlertTitle><AlertDescription>{brief.limits.length ? brief.limits.join("; ") : "No limits recorded."}</AlertDescription></Alert>
      <Card><CardHeader><CardTitle>Open follow-ups</CardTitle></CardHeader><CardContent className="space-y-3">
        {brief.follow_ups.length ? brief.follow_ups.map((f) => <div key={f._id} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{f.action}</span>{f.due_date ? <span>Due {f.due_date}</span> : null}{f.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
          {f.owner_user_id === me?.user.id || (me?.user.user_type === "coordinator" && flattenTeams(me.teams).some((t) => t._id === f.team_id && t.role === "coordinator")) ? <>
            <Button size="sm" variant="outline" onClick={async () => { try { await api(`/follow-ups/${f._id}/complete`, { body: { idempotency_key: crypto.randomUUID() } }); await load(); } catch (err) { toast.error(errorMessage(err)); } }}>Complete</Button>
            <Button size="sm" variant="outline" onClick={async () => { try {
              const { members } = await api<{ members: Array<{ user_id: string; name: string }> }>(`/teams/${f.team_id}/handoff-members`);
              const to_user_id = window.prompt(`Handoff to which member ID?\n${members.filter((m) => m.user_id !== f.owner_user_id).map((m) => `${m.name}: ${m.user_id}`).join("\n")}`);
              if (!to_user_id) return;
              const note = window.prompt("Handoff note (required)");
              if (!note) return;
              await api(`/follow-ups/${f._id}/handoff`, { body: { idempotency_key: crypto.randomUUID(), to_user_id, note } }); await load();
            } catch (err) { toast.error(errorMessage(err)); } }}>Handoff</Button>
            {me?.user.user_type === "coordinator" ? <Button size="sm" variant="outline" onClick={async () => { const note = window.prompt("Reason to cancel (required)"); if (!note) return; try { await api(`/follow-ups/${f._id}/cancel`, { body: { idempotency_key: crypto.randomUUID(), note } }); await load(); } catch (err) { toast.error(errorMessage(err)); } }}>Cancel</Button> : null}
          </> : null}
        </div>) : <p className="text-sm text-muted-foreground">None.</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Last approved logs</CardTitle></CardHeader><CardContent className="space-y-3">
        {brief.last_logs.length ? brief.last_logs.map((l) => <div key={l.id} className="border-b pb-2 text-sm">
          <p><strong>{l.fields.outcome}</strong> · {l.author} · {new Date(l.approved_at).toLocaleDateString()}</p>
          <p>{l.fields.donor_stated_reason}</p><p>Preference: {l.fields.preference}</p>
          {l.caller_id === me?.user.id || (me?.user.user_type === "coordinator" && flattenTeams(me.teams).some((t) => t._id === l.team_id && t.role === "coordinator")) ? <Link className="underline" to={`/logs/${l.id}/warmth`}>Warmth rating</Link> : null}
        </div>) : <p className="text-sm text-muted-foreground">No approved logs yet.</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Approved campaign facts</CardTitle><CardDescription>Use only these facts when answering questions.</CardDescription></CardHeader><CardContent className="space-y-4">
        {brief.fact_items.length ? brief.fact_items.map((item) => <div key={item.id} className="space-y-1 text-sm">
          <p>{item.text} {item.stale ? <Badge variant="destructive">Stale</Badge> : null}</p>
          <p className="text-muted-foreground">Source: {item.source}</p>
          <p>Approved by {item.owner}, verified {item.verified_on}.</p>
          {item.stale ? <Alert><AlertTitle>Check before using</AlertTitle><AlertDescription>This fact is older than the configured verification age.</AlertDescription></Alert> : null}
        </div>) : <p className="text-sm text-muted-foreground">No approved facts for this campaign.</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Talking points</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{brief.talking_points.map((point, index) => <p key={index}>{point}</p>)}</CardContent></Card>
    </div>
  );
}
