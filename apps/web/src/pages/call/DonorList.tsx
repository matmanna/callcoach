import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

interface DonorRow { _id: string; first_name: string; last_name: string; campaign: string; gift_band: string }

export function DonorList() {
  const [donors, setDonors] = useState<DonorRow[]>([]);
  useEffect(() => { void api<{ donors: DonorRow[] }>("/donors").then((r) => setDonors(r.donors)).catch((err: unknown) => toast.error(errorMessage(err))); }, []);
  return <div className="space-y-4"><h1 className="text-2xl font-semibold">Calls</h1>
    {donors.map((d) => <Card key={d._id}><CardHeader><CardTitle>{d.first_name} {d.last_name}</CardTitle></CardHeader><CardContent className="flex items-center justify-between gap-3 text-sm">
      <span>{d.campaign} · {d.gift_band}</span><Button asChild size="sm"><Link to={`/call/${d._id}/brief`}>Open brief</Link></Button>
    </CardContent></Card>)}
    {!donors.length ? <p className="text-muted-foreground">No assigned donors yet.</p> : null}
  </div>;
}
