import { AppLayout, HomeRedirect } from "@/components/AppLayout";
import { CoordinatorShell } from "@/components/dash/CoordinatorShell";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/lib/session";
import { AcceptInvite } from "@/pages/auth/AcceptInvite";
import { Onboarding } from "@/pages/auth/Onboarding";
import { SignIn } from "@/pages/auth/SignIn";
import { SignUp } from "@/pages/auth/SignUp";
import { Import } from "@/pages/coordinator/Import";
import { Invites } from "@/pages/coordinator/Invites";
import { Members } from "@/pages/coordinator/Members";
import { Teams } from "@/pages/coordinator/Teams";
import { AuditPage } from "@/pages/dash/Audit";
import { CallDetailPage } from "@/pages/dash/CallDetail";
import { CallsPage } from "@/pages/dash/Calls";
import { CampaignsInsightsPage } from "@/pages/dash/CampaignsInsights";
import { ContactDetailPage } from "@/pages/dash/ContactDetail";
import { ContactsPage } from "@/pages/dash/Contacts";
import { FactSheetEditorPage } from "@/pages/dash/FactSheetEditor";
import { FollowUpsPage } from "@/pages/dash/FollowUps";
import { GeographyPage } from "@/pages/dash/Geography";
import { HandoffsPage } from "@/pages/dash/Handoffs";
import { InsightsPage } from "@/pages/dash/Insights";
import { KnowledgePage } from "@/pages/dash/Knowledge";
import { OverviewPage } from "@/pages/dash/Overview";
import { QueuePage } from "@/pages/dash/Queue";
import { RubricsPage } from "@/pages/dash/Rubrics";
import { TimeBandsPage } from "@/pages/dash/TimeBands";
import { VolunteerDetailPage } from "@/pages/dash/VolunteerDetail";
import { VolunteersPage } from "@/pages/dash/Volunteers";
import { Profile } from "@/pages/volunteer/Profile";
import { VolunteerHome } from "@/pages/volunteer/VolunteerHome";
import { createBrowserRouter, RouterProvider, useParams } from "react-router";

// Empty routes; pre-call and post-call features arrive in Prompt P2.
function Placeholder({ title }: { title: string }) {
  const { id } = useParams();
  return <h1 className="text-2xl font-semibold">{id ? `${title} ${id}` : title}</h1>;
}

const router = createBrowserRouter([
  { path: "/sign-in", element: <SignIn /> },
  { path: "/sign-up", element: <SignUp /> },
  { path: "/invite/:token", element: <AcceptInvite /> },
  { path: "/onboarding", element: <Onboarding /> },
  {
    // Coordinator dashboard. The shell redirects non-coordinators; the API enforces access.
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
      { path: "/", element: <HomeRedirect /> },
      { path: "/home", element: <VolunteerHome /> },
      { path: "/profile", element: <Profile /> },
      { path: "/gifts", element: <Placeholder title="Gifts" /> },
      { path: "/call/:id", element: <Placeholder title="Call" /> },
      { path: "/review/:id", element: <Placeholder title="Review" /> },
      { path: "*", element: <Placeholder title="Not found" /> },
    ],
  },
]);

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
      <Toaster />
    </SessionProvider>
  );
}
