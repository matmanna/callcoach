import { TimezoneSelect } from "@/components/TimezoneSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RubricBreakdown } from "@/components/dash/RubricPanel";
import { api, errorMessage } from "@/lib/api";
import { changePassword } from "@/lib/auth-client";
import { useSession } from "@/lib/session";
import { useState } from "react";
import { toast } from "sonner";

export function Profile() {
  const { me, refresh } = useSession();
  const [profile, setProfile] = useState({ display_name: me?.user.display_name ?? me?.user.name ?? "", timezone: me?.user.timezone ?? "UTC" });
  const [pw, setPw] = useState({ current: "", next: "" });
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <RubricBreakdown path="/me/rubric" title="Your rubric results" />
      <Card>
        <CardHeader>
          <CardTitle>Name and time zone</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/me", { method: "PATCH", body: profile });
                await refresh();
                toast.success("Profile saved");
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="dn">Name</FieldLabel>
                <Input id="dn" value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="tz">Time zone</FieldLabel>
                <TimezoneSelect id="tz" value={profile.timezone} onChange={(timezone) => setProfile({ ...profile, timezone })} />
              </Field>
              <Button type="submit" className="w-fit">Save</Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await changePassword(pw.current, pw.next);
                setPw({ current: "", next: "" });
                toast.success("Password changed");
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="cur">Current password</FieldLabel>
                <Input id="cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="new">New password</FieldLabel>
                <Input id="new" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
              <Button type="submit" className="w-fit" disabled={!pw.current || pw.next.length < 10}>
                Change password
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
