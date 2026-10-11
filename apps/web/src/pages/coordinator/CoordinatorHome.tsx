import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { flattenTeams, useSession } from "@/lib/session";
import { Link } from "react-router";

export function CoordinatorHome() {
  const { me } = useSession();
  const teams = flattenTeams(me?.teams ?? []);
  const cards = [
    { to: "/coordinator/teams", title: "Teams", desc: `${teams.length} teams and subteams` },
    { to: "/coordinator/members", title: "Members", desc: "Invite, change roles, remove" },
    { to: "/coordinator/invites", title: "Invites", desc: "Pending, accepted, expired, revoked" },
    { to: "/coordinator/import", title: "Import", desc: "Donors, gifts, fact sheets, rubrics" },
    { to: "/coordinator/fact-sheets", title: "Fact sheets", desc: "Approve items before callers see them" },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Coordinator home</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle>{c.title}</CardTitle>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
