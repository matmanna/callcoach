import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Invite {
  _id: string;
  email: string;
  role: string;
  team_name: string;
  state: "pending" | "accepted" | "expired" | "revoked";
  created_at: string;
  expires_at: string;
}

const VARIANT: Record<Invite["state"], "default" | "secondary" | "outline" | "destructive"> = { pending: "default", accepted: "secondary", expired: "outline", revoked: "destructive" };

export function Invites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const load = useCallback(async () => {
    try {
      setInvites((await api<{ invites: Invite[] }>("/invites")).invites);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);
  useEffect(() => void load(), [load]);
  const act = async (path: string, ok: string) => {
    try {
      const r = await api<{ link?: string }>(path, { body: {} });
      if (r.link) {
        await navigator.clipboard?.writeText(r.link).catch(() => undefined);
        toast.success("New invite link copied. Send it to them directly.", { description: r.link, duration: 20000 });
      } else toast.success(ok);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Invites</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((i) => (
            <TableRow key={i._id}>
              <TableCell>{i.email}</TableCell>
              <TableCell>{i.team_name}</TableCell>
              <TableCell>{i.role}</TableCell>
              <TableCell>
                <Badge variant={VARIANT[i.state]}>{i.state}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{new Date(i.expires_at).toLocaleDateString()}</TableCell>
              <TableCell className="space-x-2 text-right">
                {i.state === "pending" || i.state === "expired" ? (
                  <Button size="sm" variant="outline" onClick={() => act(`/invites/${i._id}/resend`, "Invite resent with a new link")}>
                    Resend
                  </Button>
                ) : null}
                {i.state === "pending" ? (
                  <Button size="sm" variant="ghost" onClick={() => act(`/invites/${i._id}/revoke`, "Invite revoked")}>
                    Revoke
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
          {!invites.length ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">No invites yet.</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
