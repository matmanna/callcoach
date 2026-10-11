import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Check, Flag, Globe, MapPin, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AuthCard, type Accent } from "./AuthCard.tsx";

type Scope = "local" | "national" | "global";

const ACCENT: Accent = { tint: "#e0f0ee", ink: "#3d8a80", icon: MapPin };
const OPTIONS: Array<{ value: Scope; label: string; help: string; icon: LucideIcon; tint: string; ink: string }> = [
  { value: "local", label: "Local", help: "My own state or province. The insights map shows regions.", icon: MapPin, tint: "#e3f1e8", ink: "#4f7d5f" },
  { value: "national", label: "National", help: "Across my country. The insights map shows countries.", icon: Flag, tint: "#e0eef8", ink: "#4a7fa6" },
  { value: "global", label: "Global", help: "Anywhere. The insights map shows countries.", icon: Globe, tint: "#ebe6f7", ink: "#7463ad" },
];
const REGION = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const ACTION = "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0";

/**
 * One question for volunteers in an organization: do you call locally, nationally, or globally?
 * The answer sets the default map on the coordinator's insights page. It can be changed later.
 */
export function ServiceScopeStep() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope | null>(null);
  const [region, setRegion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const regionOk = REGION.test(region.trim().toUpperCase());
  const valid = scope !== null && (scope !== "local" || regionOk);

  const save = async () => {
    if (!scope) return;
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "PATCH", body: { service_scope: scope, home_region: scope === "local" ? region.trim().toUpperCase() : null } });
      await refresh();
      navigate("/home", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Where do you usually call?" description="One question. It sets the default map on your coordinator's insights page. You can change it later." accent={ACCENT}>
      <form onSubmit={(e) => (e.preventDefault(), valid && void save())}>
        <FieldGroup>
          <div className="grid gap-2" role="radiogroup" aria-label="Where you call">
            {OPTIONS.map((o) => {
              const selected = scope === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setScope(o.value)}
                  className={`${ACTION} flex items-center gap-3 rounded-xl border p-3 text-left hover:bg-muted/50`}
                  style={{ borderColor: selected ? o.ink : undefined, background: selected ? o.tint : undefined, boxShadow: selected ? `0 0 0 1px ${o.ink}` : undefined }}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: o.tint, color: o.ink }} aria-hidden="true">
                    <o.icon className="size-4" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.help}</span>
                  </span>
                  {selected ? <Check className="size-4" style={{ color: o.ink }} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          {scope === "local" ? (
            <Field>
              <FieldLabel htmlFor="home-region">Your home region</FieldLabel>
              <Input id="home-region" autoComplete="off" className="font-mono" placeholder="US-PA, CA-ON, GB-ENG" value={region} onChange={(e) => setRegion(e.target.value)} />
              <FieldDescription>Country code, dash, then state or province code.</FieldDescription>
            </Field>
          ) : null}
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={!valid || busy} className={ACTION}>Save and continue</Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
