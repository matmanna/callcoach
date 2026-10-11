import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface InviteLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  link: string;
}

export function InviteLinkDialog({ open, onOpenChange, email, link }: InviteLinkDialogProps) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy automatically. Select and copy the link below.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite link ready</DialogTitle>
          <DialogDescription>Share this link with {email}. It expires in seven days.</DialogDescription>
        </DialogHeader>
        <Alert>
          <AlertTitle>Copy this link now</AlertTitle>
          <AlertDescription>This link is optional for people who already have an account: signing in with {email} takes them to onboarding. The raw token is not stored and cannot be shown again. Generating another link invalidates this one.</AlertDescription>
        </Alert>
        <Input aria-label="Invite link" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={copy}>Copy link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
