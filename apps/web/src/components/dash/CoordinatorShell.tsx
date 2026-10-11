import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
import { BookOpen, ChartColumn, LayoutDashboard, Phone, Settings, Users, type LucideIcon } from "lucide-react";
import { Fragment } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Paths that belong to this entry, including its detail pages. */
  matches: string[];
}

/** Six entries. Each one opens a hub (pages/dash/Hubs.tsx) that groups the pages it used to list. */
export const NAV: NavItem[] = [
  { to: "/coordinator", label: "Home", icon: LayoutDashboard, matches: ["/coordinator"] },
  { to: "/coordinator/people", label: "People", icon: Users, matches: ["/coordinator/people", "/coordinator/contacts", "/coordinator/volunteers", "/coordinator/teams"] },
  { to: "/coordinator/calls", label: "Calls", icon: Phone, matches: ["/coordinator/calls", "/coordinator/queue", "/coordinator/follow-ups"] },
  { to: "/coordinator/knowledge", label: "Knowledge", icon: BookOpen, matches: ["/coordinator/knowledge", "/coordinator/fact-sheets", "/coordinator/rubrics", "/coordinator/handoffs"] },
  { to: "/coordinator/insights", label: "Insights", icon: ChartColumn, matches: ["/coordinator/insights"] },
  { to: "/coordinator/admin", label: "Admin", icon: Settings, matches: ["/coordinator/admin", "/coordinator/import", "/coordinator/invites", "/coordinator/members", "/coordinator/audit"] },
];

const isUnder = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
const activeItem = (pathname: string) => NAV.find((item) => (item.to === "/coordinator" ? pathname === item.to : item.matches.some((m) => isUnder(pathname, m))));

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
  const item = activeItem(pathname);
  const detail = !!item && pathname !== item.to;
  const team = scope.team === "all" ? "All teams" : (flattenTeams(me?.teams ?? []).find((t) => t._id === scope.team)?.name ?? "Team");
  const crumbs: Array<{ label: string; to?: string }> = [{ label: team, to: scope.link("/coordinator") }];
  if (item) crumbs.push({ label: item.label, ...(detail ? { to: scope.link(item.to) } : {}) });
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
  if (me.onboarding_required || me.pending_invites.length > 0) return <Navigate to="/onboarding" replace />;
  if (!isCoordinator(me)) return <Navigate to="/home" replace />;
  return (
    <TooltipProvider>
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-2">
          <div className="px-2 pt-1 text-sm font-semibold group-data-[collapsible=icon]:hidden">CallCoach</div>
          <div className="group-data-[collapsible=icon]:hidden"><TeamSwitcher /></div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={activeItem(pathname) === item} tooltip={item.label}>
                      <Link to={scope.link(item.to)} aria-label={item.label}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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
