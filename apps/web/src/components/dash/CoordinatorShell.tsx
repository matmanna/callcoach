import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { signOut } from "@/lib/auth-client";
import { flattenTeams, isCoordinator, useSession } from "@/lib/session";
import { useTeamScope } from "@/lib/teamScope";
import { Fragment } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";

interface NavItem {
  to: string;
  label: string;
}
interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  { label: "Overview", items: [{ to: "/coordinator", label: "Home" }] },
  { label: "People", items: [{ to: "/coordinator/contacts", label: "Contacts" }, { to: "/coordinator/volunteers", label: "Volunteers" }, { to: "/coordinator/teams", label: "Teams" }] },
  { label: "Calls", items: [{ to: "/coordinator/calls", label: "Calls and logs" }, { to: "/coordinator/follow-ups", label: "Follow-ups" }, { to: "/coordinator/queue", label: "Coordinator queue" }] },
  { label: "Knowledge", items: [{ to: "/coordinator/fact-sheets", label: "Fact sheets" }, { to: "/coordinator/rubrics", label: "Rubrics" }, { to: "/coordinator/knowledge", label: "Knowledge entries" }, { to: "/coordinator/handoffs", label: "Handoff packets" }] },
  { label: "Insights", items: [{ to: "/coordinator/insights", label: "Patterns" }, { to: "/coordinator/insights/geography", label: "Geography" }, { to: "/coordinator/insights/time", label: "Time" }, { to: "/coordinator/insights/campaigns", label: "Campaigns" }] },
  { label: "Admin", items: [{ to: "/coordinator/import", label: "Imports" }, { to: "/coordinator/invites", label: "Invites" }, { to: "/coordinator/members", label: "Members" }, { to: "/coordinator/audit", label: "Audit log" }] },
];

const LABELS = new Map(NAV.flatMap((s) => s.items.map((i) => [i.to, { section: s.label, label: i.label }] as const)));

function TeamSwitcher() {
  const { me } = useSession();
  const scope = useTeamScope();
  const teams = flattenTeams(me?.teams ?? []).filter((t) => t.role === "coordinator");
  return (
    <Select value={scope.team} onValueChange={scope.setTeam}>
      <SelectTrigger className="w-full" aria-label="Team">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All teams</SelectItem>
        {teams.map((t) => (
          <SelectItem key={t._id} value={t._id}>
            {"  ".repeat(t.depth)}
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Crumbs() {
  const { pathname } = useLocation();
  const scope = useTeamScope();
  const { me } = useSession();
  const base = [...LABELS.keys()].filter((p) => pathname === p || pathname.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
  const info = base ? LABELS.get(base) : undefined;
  const detail = base && pathname !== base;
  const team = scope.team === "all" ? "All teams" : (flattenTeams(me?.teams ?? []).find((t) => t._id === scope.team)?.name ?? "Team");
  const crumbs: Array<{ label: string; to?: string }> = [{ label: team, to: scope.link("/coordinator") }];
  if (info) crumbs.push({ label: info.section }, { label: info.label, ...(detail ? { to: scope.link(base!) } : {}) });
  if (detail) crumbs.push({ label: "Details" });
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>{c.to && i < crumbs.length - 1 ? <BreadcrumbLink asChild><Link to={c.to}>{c.label}</Link></BreadcrumbLink> : <BreadcrumbPage>{c.label}</BreadcrumbPage>}</BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Coordinator dashboard layout. The sidebar collapses to an icon rail, and to a sheet on phones.
 * Menu visibility is convenience only: the API enforces every permission.
 */
export function CoordinatorShell() {
  const { me, loading, refresh } = useSession();
  const scope = useTeamScope();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!me) return <Navigate to="/sign-in" replace />;
  if (me.onboarding_required) return <Navigate to="/onboarding" replace />;
  if (!isCoordinator(me)) return <Navigate to="/home" replace />;
  return (
    <TooltipProvider>
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-2">
          <div className="px-2 pt-1 text-sm font-semibold group-data-[collapsible=icon]:hidden">Stewardship Copilot</div>
          <div className="group-data-[collapsible=icon]:hidden"><TeamSwitcher /></div>
        </SidebarHeader>
        <SidebarContent>
          {NAV.map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => {
                    const active = item.to === "/coordinator" ? pathname === item.to : pathname === item.to || (pathname.startsWith(`${item.to}/`) && !NAV.some((s) => s.items.some((o) => o.to !== item.to && o.to.startsWith(item.to) && pathname.startsWith(o.to))));
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link to={scope.link(item.to)}>
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center justify-between gap-2 px-2 text-xs group-data-[collapsible=icon]:hidden">
            <span className="truncate">{me.user.display_name ?? me.user.email}</span>
            <Button size="sm" variant="outline" onClick={async () => (await signOut(), await refresh(), navigate("/sign-in"))}>
              Sign out
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <Crumbs />
        </header>
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
