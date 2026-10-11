import { Button } from "@/components/ui/button";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { signOut } from "@/lib/auth-client";
import { isInCallPath } from "@/lib/callRoutes";
import { isCoordinator, useSession } from "@/lib/session";
import { House, LayoutDashboard, LogOut, Phone, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Also active on the call pages under this path. */
  includesCall?: boolean;
}

/**
 * Inside a live call the sidebar shrinks to its icons so the call has room. It opens again on
 * leaving the call. Only route changes trigger it, so a caller can still open the sidebar mid-call.
 */
function CallSidebarMode() {
  const { pathname } = useLocation();
  const { setOpen } = useSidebar();
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  useEffect(() => setOpenRef.current(!isInCallPath(pathname)), [pathname]);
  return null;
}

/** Signed-in shell. Navigation is convenience only: the API enforces every permission. */
export function AppLayout() {
  const { me, loading, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!me) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if ((me.onboarding_required || me.pending_invites.length > 0) && location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  const coord = isCoordinator(me);
  const items: NavItem[] = [
    coord ? { to: "/coordinator", label: "Dashboard", icon: LayoutDashboard } : { to: "/home", label: "Home", icon: House },
    { to: "/calls", label: "Calls", icon: Phone, includesCall: true },
    { to: "/profile", label: "Profile", icon: UserRound },
  ];
  const isActive = (item: NavItem) => location.pathname === item.to || (!!item.includesCall && isInCallPath(location.pathname));
  return (
    <TooltipProvider>
      <SidebarProvider>
        <CallSidebarMode />
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="px-2 pt-1 text-sm font-semibold group-data-[collapsible=icon]:hidden">CallCoach</div>
            {me.org ? <div className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{me.org.name}</div> : null}
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                        <Link to={item.to} aria-label={item.label}>
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
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Sign out"
                  onClick={async () => {
                    await signOut();
                    await refresh();
                    navigate("/sign-in");
                  }}
                >
                  <LogOut />
                  <span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="truncate px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{me.user.display_name ?? me.user.email}</div>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-5" />
            <span className="truncate text-sm text-muted-foreground">{items.find(isActive)?.label ?? "CallCoach"}</span>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export function HomeRedirect() {
  const { me, loading } = useSession();
  if (loading) return null;
  if (!me) return <Navigate to="/sign-in" replace />;
  return <Navigate to={isCoordinator(me) ? "/coordinator" : "/home"} replace />;
}
