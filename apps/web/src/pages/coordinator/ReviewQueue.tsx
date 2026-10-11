import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import type { LogFields } from "@sc/shared";

interface Queue {
  flags: Array<{ _id: string; donor_id: string; log_id: string; label: string; reason: string; advisory: string; log: LogFields | null }>;
  pending_limits: Array<{ _id: string; donor_id: string; log_id: string; limit: string }>;
}

export function ReviewQueue() {
  const [queue, setQueue] = useState<Queue>({ flags: [], pending_limits: [] });
  const load = useCallback(async () => { try { setQueue(await api<Queue>("/coordinator/queue")); } catch (err) { toast.error(errorMessage(err)); } }, []);
  useEffect(() => void load(), [load]);
  const decide = async (path: string, body: unknown = {}) => { try { await api(path, { body }); await load(); } catch (err) { toast.error(errorMessage(err)); } };
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">Review queue</h1>
    <section className="space-y-3"><h2 className="text-lg font-medium">Proposed flags</h2>
      {queue.flags.map((flag) => <Card key={flag._id}><CardHeader><CardTitle><Badge>{flag.label}</Badge></CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <p>{flag.reason}</p><p>{flag.advisory}</p>
        <p>From <Link className="underline" to={`/call/${flag.donor_id}/brief`}>log {flag.log_id}</Link></p>
        {flag.log ? <p>Outcome: {flag.log.outcome}; reason: {flag.log.donor_stated_reason}; preference: {flag.log.preference}</p> : null}
        <div className="flex gap-2"><Button size="sm" onClick={() => void decide(`/flags/${flag._id}/approve`)}>Approve</Button>
          <Button size="sm" variant="outline" onClick={() => { const note = window.prompt("Why override this flag?"); if (note) void decide(`/flags/${flag._id}/override`, { note }); }}>Override</Button>
          <Button size="sm" variant="outline" onClick={() => void decide(`/flags/${flag._id}/resolve`)}>Resolve</Button></div>
      </CardContent></Card>)}
      {!queue.flags.length ? <p className="text-sm text-muted-foreground">No proposed flags.</p> : null}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-medium">Pending limits</h2>
      {queue.pending_limits.map((limit) => <Card key={limit._id}><CardHeader><CardTitle>{limit.limit}</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-sm">
        <span>From log {limit.log_id}</span><Button size="sm" onClick={() => void decide(`/pending-limits/${limit._id}/approve`)}>Approve</Button>
        <Button size="sm" variant="outline" onClick={() => void decide(`/pending-limits/${limit._id}/reject`)}>Reject</Button>
      </CardContent></Card>)}
      {!queue.pending_limits.length ? <p className="text-sm text-muted-foreground">No pending limits.</p> : null}
    </section>
  </div>;
}
