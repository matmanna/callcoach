import { Landing } from "@/routes/landing/Landing";
import { LegalPlaceholder } from "@/routes/landing/LegalPlaceholder";
import { ArrowLeft, ArrowRight, House } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, Link, Outlet, RouterProvider } from "react-router";

type Pages = typeof import("./appPages.tsx");

/** Lazy component from the signed-in app chunk. Every page shares one chunk. */
function page<K extends keyof Pages>(name: K) {
  return lazy(async () => ({ default: (await import("./appPages.tsx"))[name] as ComponentType<any> })) as unknown as Pages[K];
}

const SessionRoot = page("SessionRoot");
const AppLayout = page("AppLayout");
const CoordinatorShell = page("CoordinatorShell");
const HomeRedirect = page("HomeRedirect");
const SignIn = page("SignIn");
const SignUp = page("SignUp");
const AcceptInvite = page("AcceptInvite");
const Onboarding = page("Onboarding");
const OverviewPage = page("OverviewPage");
const ContactDetailPage = page("ContactDetailPage");
const VolunteerDetailPage = page("VolunteerDetailPage");
const CallDetailPage = page("CallDetailPage");
const PeopleHub = page("PeopleHub");
const CallsHub = page("CallsHub");
const KnowledgeHub = page("KnowledgeHub");
const InsightsHub = page("InsightsHub");
const AdminHub = page("AdminHub");
const TabRedirect = page("TabRedirect");
const Brief = page("Brief");
const DonorList = page("DonorList");
const LiveCall = page("LiveCall");
const Warmth = page("Warmth");
const PostCall = page("PostCall");
const Profile = page("Profile");
const VolunteerHome = page("VolunteerHome");
const Placeholder = page("Placeholder");

/** Browser-like controls are shown only inside the Tauri WebView. */
function DesktopUtilityBar() {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (!isTauri) return null;

  return (
    <nav aria-label="Desktop navigation" className="flex h-11 items-center gap-1 border-b bg-background px-3">
      <Button variant="ghost" size="icon" aria-label="Back" title="Back" onClick={() => window.history.back()}>
        <ArrowLeft className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Forward" title="Forward" onClick={() => window.history.forward()}>
        <ArrowRight className="size-4" />
      </Button>
      <Button asChild variant="ghost" size="sm" className="ml-1 gap-2">
        <Link to="/app" aria-label="Home">
          <House className="size-4" />
          Home
        </Link>
      </Button>
    </nav>
  );
}

function DesktopRoot() {
  return (
    <>
      <DesktopUtilityBar />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <DesktopRoot />,
    children: [
      // Public marketing pages: no session, no API calls.
      { path: "/", element: <Landing /> },
      { path: "/privacy", element: <LegalPlaceholder page="privacy" /> },
      { path: "/terms", element: <LegalPlaceholder page="terms" /> },
      {
        element: (
          <Suspense fallback={null}>
            <SessionRoot />
          </Suspense>
        ),
        children: [
          { path: "/sign-in", element: <SignIn /> },
          { path: "/sign-up", element: <SignUp /> },
          { path: "/invite/:token", element: <AcceptInvite /> },
          { path: "/onboarding", element: <Onboarding /> },
          {
            // Coordinator dashboard (K3). The shell redirects non-coordinators; the API enforces access.
            element: <CoordinatorShell />,
            children: [
              { path: "/coordinator", element: <OverviewPage /> },
              { path: "/coordinator/people", element: <PeopleHub /> },
              { path: "/coordinator/contacts/:id", element: <ContactDetailPage /> },
              { path: "/coordinator/volunteers/:id", element: <VolunteerDetailPage /> },
              { path: "/coordinator/calls", element: <CallsHub /> },
              { path: "/coordinator/calls/:id", element: <CallDetailPage /> },
              { path: "/coordinator/knowledge", element: <KnowledgeHub /> },
              { path: "/coordinator/insights", element: <InsightsHub /> },
              { path: "/coordinator/admin", element: <AdminHub /> },
              // Links from before the hubs. Each one opens the hub tab or card that holds the page now.
              { path: "/coordinator/contacts", element: <TabRedirect to="/coordinator/people" tab="contacts" /> },
              { path: "/coordinator/volunteers", element: <TabRedirect to="/coordinator/people" tab="volunteers" /> },
              { path: "/coordinator/teams", element: <TabRedirect to="/coordinator/people" tab="teams" /> },
              { path: "/coordinator/queue", element: <TabRedirect to="/coordinator/calls" tab="queue" /> },
              { path: "/coordinator/follow-ups", element: <TabRedirect to="/coordinator/calls" tab="follow-ups" /> },
              { path: "/coordinator/fact-sheets", element: <TabRedirect to="/coordinator/knowledge" tab="fact-sheets" /> },
              { path: "/coordinator/rubrics", element: <TabRedirect to="/coordinator/knowledge" tab="rubrics" /> },
              { path: "/coordinator/handoffs", element: <TabRedirect to="/coordinator/knowledge" tab="handoffs" /> },
              { path: "/coordinator/insights/geography", element: <TabRedirect to="/coordinator/insights" tab="geography" /> },
              { path: "/coordinator/insights/time", element: <TabRedirect to="/coordinator/insights" tab="time" /> },
              { path: "/coordinator/insights/campaigns", element: <TabRedirect to="/coordinator/insights" tab="campaigns" /> },
              { path: "/coordinator/import", element: <TabRedirect to="/coordinator/admin" /> },
              { path: "/coordinator/members", element: <TabRedirect to="/coordinator/people" tab="volunteers" /> },
              { path: "/coordinator/invites", element: <TabRedirect to="/coordinator/people" tab="volunteers" /> },
                            { path: "/coordinator/audit", element: <TabRedirect to="/coordinator/admin" /> },
            ],
          },
          {
            element: <AppLayout />,
            children: [
              { path: "/app", element: <HomeRedirect /> },
              { path: "/home", element: <VolunteerHome /> },
              { path: "/profile", element: <Profile /> },
              { path: "/calls", element: <DonorList /> },
              { path: "/call/:donorId/brief", element: <Brief /> },
              { path: "/call/:donorId/post", element: <PostCall /> },
              { path: "/logs/:logId/warmth", element: <Warmth /> },
              { path: "/gifts", element: <Placeholder title="Gifts" /> },
              { path: "/call/:donorId", element: <LiveCall /> },
              { path: "/review/:id", element: <Placeholder title="Review" /> },
              { path: "*", element: <Placeholder title="Not found" /> },
            ],
          },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
