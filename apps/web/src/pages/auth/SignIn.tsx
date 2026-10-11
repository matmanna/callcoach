import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";
import { useSession } from "@/lib/session";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { AuthCard } from "./AuthCard.tsx";

export function SignIn() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; inviteEmail?: string } | null;
  const from = state?.from ?? "/app";
  const inviteEmail = state?.inviteEmail?.toLowerCase() ?? "";
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthCard title="Sign in" description={inviteEmail ? `Sign in as ${inviteEmail} to accept your invite.` : "Sign in to see your teams and calls."}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await signIn(email, password);
            await refresh();
            navigate(from, { replace: true });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Sign-in failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" required readOnly={Boolean(inviteEmail)} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={busy}>Sign in</Button>
          <p className="text-sm text-muted-foreground">
            Coordinator without an account? <Link to="/sign-up" className="underline">Create one</Link>. Volunteers join through an invite link.
          </p>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
