import { InviteLinkDialog } from "@/components/InviteLinkDialog";
import { TeamSelect } from "@/components/TeamSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { useState } from "react";
import { toast } from "sonner";

/** Creates an invitation link for one team. Used from the Volunteers tab; the team can be picked here. */
export function InviteDialog({ open, onOpenChange, defaultTeamId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; defaultTeamId: string; onCreated: () => void }) {
  const [teamId, setTeamId] = useState(defaultTeamId);
  const [invite, setInvite] = useState<{ email: string; role: "caller" | "coordinator" }>({ email: "", role: "caller" });
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);

  const create = async () => {
    try {
      const result = await api<{ link: string }>(`/teams/${teamId}/invites`, { body: invite });
      setLink({ email: invite.email, link: result.link });
      toast.success("Invite link ready");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (setError(null), onOpenChange(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>Create an invitation for this email. Existing users can sign in and accept it from onboarding; the private link is also available for new-account setup.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="inv-team">Team</FieldLabel>
              <TeamSelect id="inv-team" value={teamId} onChange={setTeamId} />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-email">Email</FieldLabel>
              <Input id="inv-email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-role">Role</FieldLabel>
              <Select value={invite.role} onValueChange={(role) => setInvite({ ...invite, role: role as "caller" | "coordinator" })}>
                <SelectTrigger id="inv-role" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="caller">caller</SelectItem>
                  <SelectItem value="coordinator">coordinator</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!teamId || !invite.email} onClick={create}>Create invite link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <InviteLinkDialog open={link !== null} onOpenChange={(o) => { if (!o) setLink(null); }} email={link?.email ?? ""} link={link?.link ?? ""} />
    </>
  );
}
