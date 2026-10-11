import { browserTimezone, TimezoneSelect } from "@/components/TimezoneSelect";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { AuthCard } from "./AuthCard.tsx";

/** Coordinator onboarding: profile + organization, then the first team. */
export function Onboarding() {
  const { me, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(me?.onboarding_required === false ? 2 : 1);
  const [profile, setProfile] = useState({ display_name: me?.user.name ?? "", org_name: "", timezone: browserTimezone() });
  const [team, setTeam] = useState({ name: "", focus: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (loading) return null;
  if (!me) return <Navigate to="/sign-in" replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (me.pending_invites.length > 0)
    return (
      <AuthCard title="Your invitations" description="Accept a team invitation to finish signing in.">
        <FieldGroup>
          {me.pending_invites.map((invite) => (
            <div key={invite.id} className="rounded-md border p-4">
              <p className="font-medium">{invite.team_name}</p>
              <p className="text-sm text-muted-foreground">{invite.org_name} invited you as a {invite.role}.</p>
              {invite.team_focus ? <p className="mt-1 text-sm text-muted-foreground">Team focus: {invite.team_focus}</p> : null}
              <Button className="mt-3" onClick={() => run(async () => { const result = await api<{ call_count: number }>(`/onboarding/invites/${invite.id}/accept`, { body: {} }); await refresh(); toast.success(`${result.call_count} calls are ready for your team.`); navigate("/app", { replace: true }); })} disabled={busy}>
                Join team
              </Button>
            </div>
          ))}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
      </AuthCard>
    );

  if (me.user.user_type !== "coordinator") return <Navigate to="/home" replace />;

  if (step === 1)
    return (
      <AuthCard title="Set up your organization" description="Step 1 of 2">
        <form onSubmit={(e) => (e.preventDefault(), run(async () => (await api("/onboarding/coordinator", { body: profile }), await refresh(), setStep(2))))}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dn">Your name</FieldLabel>
              <Input id="dn" required value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="org">Organization name</FieldLabel>
              <Input id="org" required value={profile.org_name} onChange={(e) => setProfile({ ...profile, org_name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="tz">Time zone</FieldLabel>
              <TimezoneSelect id="tz" value={profile.timezone} onChange={(timezone) => setProfile({ ...profile, timezone })} />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
            <Button type="submit" disabled={busy}>Continue</Button>
          </FieldGroup>
        </form>
      </AuthCard>
    );

  return (
    <AuthCard title="Create your first team" description="Step 2 of 2. You can add subteams later.">
      <form onSubmit={(e) => (e.preventDefault(), run(async () => (await api("/teams", { body: team }), await refresh(), navigate("/coordinator"))))}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="tn">Team name</FieldLabel>
            <Input id="tn" required value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="tf">Focus</FieldLabel>
            <Input id="tf" placeholder="student calling, international donors" value={team.focus} onChange={(e) => setTeam({ ...team, focus: e.target.value })} />
            <FieldDescription>A short description of who this team calls.</FieldDescription>
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={busy}>Create team</Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
