import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { flattenTeams, useSession } from "@/lib/session";

export function VolunteerHome() {
  const { me } = useSession();
  const teams = flattenTeams(me?.teams ?? []);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Welcome{me?.user.display_name ? `, ${me.user.display_name}` : ""}</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your teams</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((t) => (
            <Card key={t._id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {t.name} <Badge variant="outline">{t.role}</Badge>
                </CardTitle>
                <CardDescription>{t.focus || "No focus set yet."}</CardDescription>
              </CardHeader>
            </Card>
          ))}
          {!teams.length ? <p className="text-muted-foreground">You are not on a team yet.</p> : null}
        </div>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Today's calls</CardTitle>
          <CardDescription>Planning arrives in a later build.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
