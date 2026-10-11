import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signOut } from "@/lib/auth-client";
import { isCoordinator, useSession } from "@/lib/session";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";

const link = ({ isActive }: { isActive: boolean }) => (isActive ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground");

/** Signed-in shell. Navigation is convenience only: the API enforces every permission. */
export function AppLayout() {
  const { me, loading, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!me) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (me.onboarding_required && location.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  const coord = isCoordinator(me);
  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-wrap items-center gap-4 px-6 py-3">
        <span className="font-semibold">Stewardship Copilot</span>
        {me.org ? <span className="text-sm text-muted-foreground">{me.org.name}</span> : null}
        <nav className="flex flex-wrap gap-4 text-sm">
          {coord ? (
            <>
              <NavLink to="/coordinator" end className={link}>Home</NavLink>
              <NavLink to="/coordinator/teams" className={link}>Teams</NavLink>
              <NavLink to="/coordinator/members" className={link}>Members</NavLink>
              <NavLink to="/coordinator/invites" className={link}>Invites</NavLink>
              <NavLink to="/coordinator/import" className={link}>Import</NavLink>
              <NavLink to="/coordinator/fact-sheets" className={link}>Fact sheets</NavLink>
              <NavLink to="/coordinator/queue" className={link}>Review queue</NavLink>
            </>
          ) : (
            <NavLink to="/home" className={link}>Home</NavLink>
          )}
          <NavLink to="/calls" className={link}>Calls</NavLink>
          <NavLink to="/profile" className={link}>Profile</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{me.user.display_name ?? me.user.email}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await signOut();
              await refresh();
              navigate("/sign-in");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <Separator />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

export function HomeRedirect() {
  const { me, loading } = useSession();
  if (loading) return null;
  if (!me) return <Navigate to="/sign-in" replace />;
  return <Navigate to={isCoordinator(me) ? "/coordinator" : "/home"} replace />;
}

/** UI-side gate for coordinator pages. The API independently returns 403/404. */
export function CoordinatorOnly({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  if (!isCoordinator(me)) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
