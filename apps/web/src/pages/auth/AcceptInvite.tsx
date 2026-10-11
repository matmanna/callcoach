import { browserTimezone, TimezoneSelect } from "@/components/TimezoneSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AuthCard } from "./AuthCard.tsx";

interface InviteInfo {
  email: string;
  role: "caller" | "coordinator";
  team_name: string;
  team_focus: string;
  org_name: string;
  has_account: boolean;
}

/** Volunteer onboarding: accept invite, set password, confirm name and time zone. */
export function AcceptInvite() {
  const { token = "" } = useParams();
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [form, setForm] = useState({ display_name: "", password: "", timezone: browserTimezone() });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<InviteInfo>("/invites/lookup", { body: { token } })
      .then(setInfo)
      .catch((err) => setGone(err instanceof ApiError && err.status === 410 ? `This invite is ${err.code.replace(/_/g, " ")}.` : "This invite link is not valid."));
  }, [token]);

  if (gone)
    return (
      <AuthCard title="Invite unavailable">
        <Alert variant="destructive">
          <AlertTitle>{gone}</AlertTitle>
          <AlertDescription>Ask your coordinator to send a new invite.</AlertDescription>
        </Alert>
      </AuthCard>
    );
  if (!info) return <AuthCard title="Checking invite…">{null}</AuthCard>;

  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/invites/accept", { body: info.has_account ? { token } : { token, ...form } });
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={`Join ${info.team_name}`} description={`${info.org_name} invited ${info.email} as a ${info.role}.`}>
      {info.team_focus ? <p className="mb-4 text-sm text-muted-foreground">Team focus: {info.team_focus}</p> : null}
      {info.has_account && me?.user.email.toLowerCase() !== info.email ? (
        <Alert>
          <AlertTitle>You already have an account</AlertTitle>
          <AlertDescription>
            <Link to="/sign-in" state={{ from: `/invite/${token}` }} className="underline">Sign in as {info.email}</Link> to accept.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={accept}>
          <FieldGroup>
            {!info.has_account ? (
              <>
                <Field>
                  <FieldLabel htmlFor="dn">Your name</FieldLabel>
                  <Input id="dn" required value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="pw">Set a password</FieldLabel>
                  <Input id="pw" type="password" autoComplete="new-password" minLength={10} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  <FieldDescription>At least 10 characters.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="tz">Time zone</FieldLabel>
                  <TimezoneSelect id="tz" value={form.timezone} onChange={(timezone) => setForm({ ...form, timezone })} />
                </Field>
              </>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
            <Button type="submit" disabled={busy}>Accept invite</Button>
          </FieldGroup>
        </form>
      )}
    </AuthCard>
  );
}
