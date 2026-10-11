import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUpCoordinator } from "@/lib/auth-client";
import { useSession } from "@/lib/session";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthCard } from "./AuthCard.tsx";

/** Coordinator sign-up only. Volunteers cannot self-register (the API rejects it too). */
export function SignUp() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <AuthCard title="Create a coordinator account" description="You'll set up your organization and first team next.">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await signUpCoordinator(form);
            await refresh();
            navigate("/onboarding");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Sign-up failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input id="name" required value={form.name} onChange={set("name")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" type="password" autoComplete="new-password" minLength={10} required value={form.password} onChange={set("password")} />
            <FieldDescription>At least 10 characters.</FieldDescription>
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={busy}>Create account</Button>
          <p className="text-sm text-muted-foreground">
            Already have an account? <Link to="/sign-in" className="underline">Sign in</Link>
          </p>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
