import { TeamSelect } from "@/components/TeamSelect";
import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { flattenTeams, useSession } from "@/lib/session";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

interface Member {
  membership_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  user_type: string;
  role: "caller" | "coordinator";
  status: "active" | "removed";
  joined_at: string;
}

export function Members() {
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  const firstTeam = flattenTeams(me?.teams ?? []).find((t) => t.role === "coordinator" && t.depth > 0)?._id ?? flattenTeams(me?.teams ?? [])[0]?._id ?? "";
  const teamId = params.get("team") ?? firstTeam;
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<{ email: string; role: "caller" | "coordinator" }>({ email: "", role: "caller" });
  const [generatedLink, setGeneratedLink] = useState<{ email: string; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    try {
      setMembers((await api<{ members: Member[] }>(`/teams/${teamId}/members`)).members);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [teamId]);
  useEffect(() => void load(), [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Members</h1>
        <div className="flex flex-wrap items-center gap-2">
          <TeamSelect value={teamId} onChange={(id) => setParams({ team: id })} />
          <Button onClick={() => (setError(null), setInvite({ email: "", role: "caller" }), setInviteOpen(true))} disabled={!teamId}>
            Invite
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.membership_id}>
              <TableCell>{m.display_name ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{m.email}</TableCell>
              <TableCell>
                {m.status === "active" && m.user_id !== me?.user.id ? (
                  <Select value={m.role} onValueChange={(role) => act(() => api(`/memberships/${m.membership_id}`, { method: "PATCH", body: { role } }), "Role updated")}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caller">caller</SelectItem>
                      <SelectItem value="coordinator" disabled={m.user_type !== "coordinator"}>
                        coordinator
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{m.role}</Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={m.status === "active" ? "secondary" : "outline"}>{m.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                {m.status === "active" && m.user_id !== me?.user.id ? (
                  <Button size="sm" variant="ghost" onClick={() => act(() => api(`/memberships/${m.membership_id}/remove`, { body: {} }), "Member removed")}>
                    Remove
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
          {!members.length ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No members yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite to {flattenTeams(me?.teams ?? []).find((t) => t._id === teamId)?.name}</DialogTitle>
            <DialogDescription>Create an invitation for this email. Existing users can sign in and accept it from onboarding; the private link is also available for new-account setup.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="inv-email">Email</FieldLabel>
              <Input id="inv-email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-role">Role</FieldLabel>
              <Select value={invite.role} onValueChange={(role) => setInvite({ ...invite, role: role as "caller" | "coordinator" })}>
                <SelectTrigger id="inv-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="caller">caller</SelectItem>
                  <SelectItem value="coordinator">coordinator</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                try {
                  const result = await api<{ link: string }>(`/teams/${teamId}/invites`, { body: invite });
                  setGeneratedLink({ email: invite.email, link: result.link });
                  toast.success("Invite link ready");
                  setInviteOpen(false);
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              Create invite link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <InviteLinkDialog
        open={generatedLink !== null}
        onOpenChange={(open) => { if (!open) setGeneratedLink(null); }}
        email={generatedLink?.email ?? ""}
        link={generatedLink?.link ?? ""}
      />
    </div>
  );
}
