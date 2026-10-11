import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { isCoordinator, useSession } from "@/lib/session";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

interface DonorRow { _id: string; first_name: string; last_name: string; campaign: string; gift_band: string }

export function DonorList() {
  const { me } = useSession();
  const [donors, setDonors] = useState<DonorRow[]>([]);
  useEffect(() => { void api<{ donors: DonorRow[] }>("/donors").then((r) => setDonors(r.donors)).catch((err: unknown) => toast.error(errorMessage(err))); }, []);
  return <div className="space-y-4"><div><h1 className="text-2xl font-semibold">Calls</h1><p className="text-sm text-muted-foreground">Pick a donor, read the short brief, then make the call.</p></div>
    {donors.map((d) => <Card key={d._id}><CardHeader><CardTitle>{d.first_name} {d.last_name}</CardTitle></CardHeader><CardContent className="flex items-center justify-between gap-3 text-sm">
      <span>{d.campaign} · {d.gift_band}</span><Button asChild size="sm"><Link to={`/call/${d._id}/brief`}>Open brief</Link></Button>
    </CardContent></Card>)}
    {!donors.length ? (
      <p className="text-muted-foreground">
        No assigned donors yet.{" "}
        {isCoordinator(me) ? <>Coordinators can call every donor on the teams they coordinate. <Link className="underline" to="/coordinator/import">Import donors</Link> to get started.</> : "Ask your coordinator to add you to a team."}
      </p>
    ) : null}
  </div>;
}
