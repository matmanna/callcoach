import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ContactRequest } from "@sc/shared";
import { CheckIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { contact as copy } from "../copy.ts";
import { Ripple } from "./motion.tsx";

type Values = { name: string; email: string; organization: string; role: string; team_size: string; message: string };
type FieldName = keyof Values;
type Errors = Partial<Record<FieldName, string>>;

const EMPTY: Values = { name: "", email: "", organization: "", role: "", team_size: "", message: "" };

/** Validates locally with the shared Zod schema first; nothing is sent while any field is invalid. */
export function ContactForm({ submit = postContact }: { submit?: (body: ContactRequest) => Promise<string> }) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [done, setDone] = useState<string | null>(null);

  const set = (k: FieldName) => (v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = ContactRequest.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as FieldName;
        next[k] ??= issue.message;
      }
      setErrors(next);
      document.getElementById(`contact-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setStatus("sending");
    try {
      setDone(await submit(parsed.data));
    } catch {
      setStatus("error");
    }
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 py-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-(--lp-sage-soft) text-(--lp-sage-ink)">
          <CheckIcon className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="text-xl font-medium">{copy.successTitle}</p>
        <p className="text-(--lp-ink-soft)">{done}</p>
      </div>
    );
  }

  const text = (k: Exclude<FieldName, "team_size" | "message">, label: string, props: { type?: string; autoComplete?: string; placeholder?: string } = {}) => (
    <Field data-invalid={!!errors[k] || undefined}>
      <FieldLabel htmlFor={`contact-${k}`}>{label}</FieldLabel>
      <Input
        id={`contact-${k}`}
        name={k}
        value={values[k]}
        onChange={(e) => set(k)(e.target.value)}
        aria-invalid={!!errors[k] || undefined}
        aria-describedby={errors[k] ? `contact-${k}-error` : undefined}
        className="h-11 bg-(--lp-surface)"
        {...props}
      />
      {errors[k] ? <FieldError id={`contact-${k}-error`}>{errors[k]}</FieldError> : null}
    </Field>
  );

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Contact form">
      <FieldGroup className="gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {text("name", copy.fields.name, { autoComplete: "name" })}
          {text("email", copy.fields.email, { type: "email", autoComplete: "email" })}
          {text("organization", copy.fields.organization, { autoComplete: "organization" })}
          {text("role", copy.fields.role, { autoComplete: "organization-title", placeholder: copy.fields.rolePlaceholder })}
        </div>
        <Field data-invalid={!!errors.team_size || undefined}>
          <FieldLabel htmlFor="contact-team_size">{copy.fields.teamSize}</FieldLabel>
          <Select value={values.team_size} onValueChange={set("team_size")} name="team_size">
            <SelectTrigger
              id="contact-team_size"
              aria-invalid={!!errors.team_size || undefined}
              aria-describedby={errors.team_size ? "contact-team_size-error" : undefined}
              className="w-full bg-(--lp-surface) data-[size=default]:h-11 sm:w-72"
            >
              <SelectValue placeholder={copy.fields.teamSizePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {copy.teamSizes.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.team_size ? <FieldError id="contact-team_size-error">{errors.team_size}</FieldError> : null}
        </Field>
        <Field data-invalid={!!errors.message || undefined}>
          <FieldLabel htmlFor="contact-message">{copy.fields.message}</FieldLabel>
          <Textarea
            id="contact-message"
            name="message"
            rows={4}
            value={values.message}
            onChange={(e) => set("message")(e.target.value)}
            aria-invalid={!!errors.message || undefined}
            className="bg-(--lp-surface)"
          />
          {errors.message ? <FieldError>{errors.message}</FieldError> : <FieldDescription>{copy.fields.messageOptional}</FieldDescription>}
        </Field>
        {status === "error" ? <FieldError>{copy.error}</FieldError> : null}
        <div>
          <Button type="submit" size="lg" disabled={status === "sending"} className="lp-press relative h-11 overflow-hidden rounded-xl px-5">
            <Ripple />
            {status === "sending" ? copy.sending : copy.submit}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

async function postContact(body: ContactRequest): Promise<string> {
  const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  const json = (await res.json()) as { message?: string };
  return json.message ?? "";
}
