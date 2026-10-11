import { browserTimezone, TimezoneSelect } from "@/components/TimezoneSelect";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ORG_PROFILE_LABELS, RubricFile } from "@sc/shared";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { AuthCard, type Accent } from "./AuthCard.tsx";
import { ArrowRight, Building2, Check, FileUp, Hand, type LucideIcon, SkipForward, SlidersHorizontal, UsersRound } from "lucide-react";
import rubricRaw from "../../../../../data/rubric.json";

const STEPS = 5;

/** Each step gets its own pastel. Ink colors are the same family, darker, for text and icons. */
const STEP_ACCENTS: Array<Accent & { icon: LucideIcon }> = [
  { tint: "#e3f1e8", ink: "#4f7d5f", icon: Hand },
  { tint: "#ebe6f7", ink: "#7463ad", icon: Building2 },
  { tint: "#e0eef8", ink: "#4a7fa6", icon: FileUp },
  { tint: "#fbe9de", ink: "#b8703f", icon: SlidersHorizontal },
  { tint: "#fbf3d6", ink: "#9a7d1f", icon: UsersRound },
];

/** Hover and press feedback shared by every action button on the onboarding screens. */
const ACTION = "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm";

/** Five pills, one per step. The current one carries its pastel; finished ones show a check. */
function StepDots({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Step ${step} of ${STEPS}`}>
      {STEP_ACCENTS.map((a, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={n} className="flex items-center gap-1.5">
            <span
              className="flex size-7 items-center justify-center rounded-full text-xs transition-all duration-300"
              style={{ background: current || done ? a.tint : undefined, color: current || done ? a.ink : undefined, boxShadow: current ? `0 0 0 2px ${a.ink}` : undefined }}
              aria-current={current ? "step" : undefined}
            >
              {done ? <Check className="size-3.5" /> : <span className={current ? "font-semibold" : "text-muted-foreground"}>{n}</span>}
            </span>
            {n < STEPS ? <span className="h-px w-3 bg-border" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
const UNSET = "unset";
/** Default call evaluation items, used when the organization has no rubric yet. */
const DEFAULT_RUBRIC_ITEMS = RubricFile.parse(rubricRaw).items;

interface WeightedItem {
  id: string;
  text: string;
  supporting_tags: string[];
  conditional_on_tag?: string | undefined;
  weight: number;
}

interface OrgRubric {
  team_id: string | null;
  items: Array<WeightedItem | (Omit<WeightedItem, "weight"> & { weight?: number })>;
}

/** Shared by the profile and fact sheet steps: a short line above the form, then the form. */
function StepIntro({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function SkipLink({ onSkip, busy }: { onSkip: () => void; busy: boolean }) {
  return (
    <Button type="button" variant="ghost" className={`${ACTION} hover:bg-muted`} onClick={onSkip} disabled={busy}>
      <SkipForward className="size-4" />
      Skip for now
    </Button>
  );
}

/**
 * Coordinator onboarding, five short steps: account and organization, organization profile,
 * fact sheet, rubric weights, first team. Every step after the first can be skipped and changed later.
 */
export function Onboarding() {
  const { me, loading, refresh } = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState<number>(me?.onboarding_required === false ? 2 : 1);
  const [profile, setProfile] = useState({ display_name: me?.user.name ?? "", org_name: "", timezone: browserTimezone() });
  const [org, setOrg] = useState({ nonprofit_status: UNSET, annual_revenue_band: UNSET, staff_size_band: UNSET, country: "", mission: "" });
  const [factFile, setFactFile] = useState<{ name: string; content: string } | null>(null);
  const [factResult, setFactResult] = useState<{ approved: number } | null>(null);
  const [weights, setWeights] = useState<WeightedItem[] | null>(null);
  const [team, setTeam] = useState({ name: "", focus: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the organization rubric (or the default) the first time the weights step opens.
  useEffect(() => {
    if (step !== 4 || weights) return;
    api<{ rubrics: OrgRubric[] }>("/rubrics")
      .then(({ rubrics }) => {
        const own = rubrics.find((r) => r.team_id === null);
        const source = own ? own.items : DEFAULT_RUBRIC_ITEMS;
        setWeights(source.map((i) => ({ ...i, supporting_tags: [...i.supporting_tags], weight: ("weight" in i ? i.weight : undefined) ?? 1 })));
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setWeights(DEFAULT_RUBRIC_ITEMS.map((i) => ({ ...i, supporting_tags: [...i.supporting_tags], weight: 1 })));
      });
  }, [step, weights]);

  if (loading) return null;
  if (!me) return <Navigate to="/sign-in" replace />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError && Array.isArray(err.body.warnings) ? (err.body.warnings as string[]).join(" ") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const next = () => setStep((s) => s + 1);
  const choice = (v: string) => (v === UNSET ? null : v);

  if (me.pending_invites.length > 0)
    return (
      <AuthCard title="Your invitations" description="Accept a team invitation to finish signing in." accent={STEP_ACCENTS[0]}>
        <FieldGroup>
          {me.pending_invites.map((invite) => (
            <div key={invite.id} className="rounded-md border p-4">
              <p className="font-medium">{invite.team_name}</p>
              <p className="text-sm text-muted-foreground">{invite.org_name} invited you as a {invite.role}.</p>
              {invite.team_focus ? <p className="mt-1 text-sm text-muted-foreground">Team focus: {invite.team_focus}</p> : null}
              <Button className={`mt-3 ${ACTION}`} onClick={() => run(async () => { const result = await api<{ call_count: number }>(`/onboarding/invites/${invite.id}/accept`, { body: {} }); await refresh(); toast.success(`${result.call_count} calls are ready for your team.`); navigate("/app", { replace: true }); })} disabled={busy}>
                Join team
              </Button>
            </div>
          ))}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
      </AuthCard>
    );

  if (me.user.user_type !== "coordinator") return <Navigate to="/home" replace />;

  const progress = <StepDots step={step} />;

  if (step === 1)
    return (
      <AuthCard title="Welcome. Let's set up your organization." description={`Step 1 of ${STEPS}. Takes about five minutes. You can skip any step and come back later.`} accent={STEP_ACCENTS[0]}>
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
            <Button type="submit" disabled={busy} className={ACTION}>Continue<ArrowRight className="size-4" /></Button>
            {progress}
          </FieldGroup>
        </form>
      </AuthCard>
    );

  if (step === 2) {
    const saveProfile = () =>
      run(async () => {
        await api("/org/profile", {
          method: "PUT",
          body: {
            nonprofit_status: choice(org.nonprofit_status),
            annual_revenue_band: choice(org.annual_revenue_band),
            staff_size_band: choice(org.staff_size_band),
            country: org.country.trim() || null,
            mission: org.mission.trim() || null,
          },
        });
        await refresh();
        next();
      });
    return (
      <AuthCard title="About your organization" description={`Step 2 of ${STEPS}. Helps Copilot describe your work accurately. Every answer is optional.`} accent={STEP_ACCENTS[1]}>
        <form onSubmit={(e) => (e.preventDefault(), saveProfile())}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ns">Organization type</FieldLabel>
              <Select value={org.nonprofit_status} onValueChange={(v) => setOrg({ ...org, nonprofit_status: v })}>
                <SelectTrigger id="ns" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not set</SelectItem>
                  {Object.entries(ORG_PROFILE_LABELS.nonprofitStatus).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="rv">Annual revenue</FieldLabel>
              <Select value={org.annual_revenue_band} onValueChange={(v) => setOrg({ ...org, annual_revenue_band: v })}>
                <SelectTrigger id="rv" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not set</SelectItem>
                  {Object.entries(ORG_PROFILE_LABELS.revenueBand).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldDescription>A rough band is enough. It stays on your organization record.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="ss">Staff size</FieldLabel>
              <Select value={org.staff_size_band} onValueChange={(v) => setOrg({ ...org, staff_size_band: v })}>
                <SelectTrigger id="ss" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not set</SelectItem>
                  {Object.entries(ORG_PROFILE_LABELS.staffSize).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ctry">Country</FieldLabel>
              <Input id="ctry" maxLength={80} value={org.country} onChange={(e) => setOrg({ ...org, country: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="mis">What the organization does</FieldLabel>
              <Textarea id="mis" maxLength={300} rows={3} placeholder="For example: after-school mentoring for students in our town." value={org.mission} onChange={(e) => setOrg({ ...org, mission: e.target.value })} />
              <FieldDescription>One or two sentences in your own words. Up to 300 characters.</FieldDescription>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy} className={ACTION}>Save and continue<ArrowRight className="size-4" /></Button>
              <SkipLink onSkip={next} busy={busy} />
            </div>
            {progress}
          </FieldGroup>
        </form>
      </AuthCard>
    );
  }

  if (step === 3)
    return (
      <AuthCard title="Upload your fact sheet" description={`Step 3 of ${STEPS}. Approved facts are the only program claims Copilot uses with donors.`} accent={STEP_ACCENTS[2]}>
        <FieldGroup>
          <StepIntro>
            Upload a CSV or JSON file with <code>text</code>, <code>source</code>, and <code>verified_on</code> (YYYY-MM-DD) for each fact.
            Copilot reads these facts as background when it drafts. Every fact carries its source and date.
          </StepIntro>
          <Field>
            <FieldLabel htmlFor="facts">Fact sheet file</FieldLabel>
            <Input
              id="facts"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setFactResult(null);
                setError(null);
                setFactFile(file ? { name: file.name, content: await file.text() } : null);
              }}
            />
            <FieldDescription>Donor names, phone numbers, emails, and street addresses are refused. Check each fact is about your programs.</FieldDescription>
          </Field>
          {factResult ? <p className="text-sm">{factResult.approved} facts approved. You can edit them any time under Fact sheets.</p> : null}
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className={ACTION}
              disabled={busy || !factFile}
              onClick={() =>
                run(async () => {
                  const r = await api<{ approved: number }>("/onboarding/fact-sheet", { body: { file_name: factFile!.name, content: factFile!.content, update_existing: false } });
                  setFactResult({ approved: r.approved });
                  await refresh();
                  next();
                })
              }
            >
              <FileUp className="size-4" />
              Upload and continue
            </Button>
            <SkipLink onSkip={next} busy={busy} />
          </div>
          {progress}
        </FieldGroup>
      </AuthCard>
    );

  if (step === 4) {
    const total = (weights ?? []).reduce((sum, i) => sum + i.weight, 0);
    const saveWeights = () =>
      run(async () => {
        if (!weights || total === 0) throw new Error("Give at least one item a weight above 0.");
        await api("/onboarding/rubric", { method: "PUT", body: { items: weights.map((i) => ({ id: i.id, text: i.text, supporting_tags: i.supporting_tags, conditional_on_tag: i.conditional_on_tag ?? null, weight: i.weight })) } });
        next();
      });
    return (
      <AuthCard title="How much each thing counts" description={`Step 4 of ${STEPS}. Weights set how much each rubric item counts in a call's evaluation.`} accent={STEP_ACCENTS[3]}>
        <form onSubmit={(e) => (e.preventDefault(), saveWeights())}>
          <FieldGroup>
            <StepIntro>Use a whole number from 0 to 5. A 0 turns an item off. Your coordinators can change these later under Rubrics.</StepIntro>
            {!weights ? <p className="text-sm text-muted-foreground">Loading the rubric…</p> : null}
            {(weights ?? []).map((item, idx) => {
              const share = total ? Math.round((item.weight / total) * 100) : 0;
              return (
                <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-3">
                  <Field>
                    <FieldLabel htmlFor={`w-${item.id}`} className="font-normal">{item.text}</FieldLabel>
                    <FieldDescription>{item.weight === 0 ? "Off" : `${share}% of the score`}</FieldDescription>
                  </Field>
                  <Input
                    id={`w-${item.id}`}
                    aria-label={`Weight for ${item.text}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={5}
                    step={1}
                    className="w-20"
                    value={item.weight}
                    onChange={(e) => {
                      const n = Math.min(5, Math.max(0, Math.round(Number(e.target.value) || 0)));
                      setWeights((ws) => (ws ?? []).map((w, i) => (i === idx ? { ...w, weight: n } : w)));
                    }}
                  />
                </div>
              );
            })}
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || !weights} className={ACTION}>Save weights and continue<ArrowRight className="size-4" /></Button>
              <SkipLink onSkip={next} busy={busy} />
            </div>
            {progress}
          </FieldGroup>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your first team" description={`Step 5 of ${STEPS}. You can add subteams later.`} accent={STEP_ACCENTS[4]}>
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
          <Button type="submit" disabled={busy} className={ACTION}><Check className="size-4" />Create team</Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
