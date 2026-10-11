/**
 * The signed-in app, loaded as one lazy chunk so the public landing page stays small.
 * Everything here runs inside SessionProvider (see SessionRoot).
 */
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/lib/session";
import { Outlet, useParams } from "react-router";

export { AppLayout, CoordinatorOnly, HomeRedirect } from "@/components/AppLayout";
export { AcceptInvite } from "@/pages/auth/AcceptInvite";
export { Onboarding } from "@/pages/auth/Onboarding";
export { SignIn } from "@/pages/auth/SignIn";
export { SignUp } from "@/pages/auth/SignUp";
export { CoordinatorHome } from "@/pages/coordinator/CoordinatorHome";
export { FactSheets } from "@/pages/coordinator/FactSheets";
export { Import } from "@/pages/coordinator/Import";
export { Invites } from "@/pages/coordinator/Invites";
export { Members } from "@/pages/coordinator/Members";
export { Teams } from "@/pages/coordinator/Teams";
export { Profile } from "@/pages/volunteer/Profile";
export { VolunteerHome } from "@/pages/volunteer/VolunteerHome";

/** Session context for every app route; the landing page never mounts it, so it makes no API call. */
export function SessionRoot() {
  return (
    <SessionProvider>
      <Outlet />
      <Toaster />
    </SessionProvider>
  );
}

// Empty routes; pre-call and post-call features arrive in Prompt P2.
export function Placeholder({ title }: { title: string }) {
  const { id } = useParams();
  return <h1 className="text-2xl font-semibold">{id ? `${title} ${id}` : title}</h1>;
}
