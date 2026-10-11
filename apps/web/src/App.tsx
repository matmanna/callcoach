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
const ContactsPage = page("ContactsPage");
const ContactDetailPage = page("ContactDetailPage");
const VolunteersPage = page("VolunteersPage");
const VolunteerDetailPage = page("VolunteerDetailPage");
const CallsPage = page("CallsPage");
const CallDetailPage = page("CallDetailPage");
const FollowUpsPage = page("FollowUpsPage");
const QueuePage = page("QueuePage");
const FactSheetEditorPage = page("FactSheetEditorPage");
const RubricsPage = page("RubricsPage");
const KnowledgePage = page("KnowledgePage");
const HandoffsPage = page("HandoffsPage");
const InsightsPage = page("InsightsPage");
const GeographyPage = page("GeographyPage");
const TimeBandsPage = page("TimeBandsPage");
const CampaignsInsightsPage = page("CampaignsInsightsPage");
const AuditPage = page("AuditPage");
const Import = page("Import");
const Invites = page("Invites");
const Members = page("Members");
const Teams = page("Teams");
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
              { path: "/coordinator/contacts", element: <ContactsPage /> },
              { path: "/coordinator/contacts/:id", element: <ContactDetailPage /> },
              { path: "/coordinator/volunteers", element: <VolunteersPage /> },
              { path: "/coordinator/volunteers/:id", element: <VolunteerDetailPage /> },
              { path: "/coordinator/teams", element: <Teams /> },
              { path: "/coordinator/calls", element: <CallsPage /> },
              { path: "/coordinator/calls/:id", element: <CallDetailPage /> },
              { path: "/coordinator/follow-ups", element: <FollowUpsPage /> },
              { path: "/coordinator/queue", element: <QueuePage /> },
              { path: "/coordinator/fact-sheets", element: <FactSheetEditorPage /> },
              { path: "/coordinator/rubrics", element: <RubricsPage /> },
              { path: "/coordinator/knowledge", element: <KnowledgePage /> },
              { path: "/coordinator/handoffs", element: <HandoffsPage /> },
              { path: "/coordinator/insights", element: <InsightsPage /> },
              { path: "/coordinator/insights/geography", element: <GeographyPage /> },
              { path: "/coordinator/insights/time", element: <TimeBandsPage /> },
              { path: "/coordinator/insights/campaigns", element: <CampaignsInsightsPage /> },
              { path: "/coordinator/import", element: <Import /> },
              { path: "/coordinator/invites", element: <Invites /> },
              { path: "/coordinator/members", element: <Members /> },
              { path: "/coordinator/audit", element: <AuditPage /> },
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
