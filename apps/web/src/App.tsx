import { AppLayout, CoordinatorOnly, HomeRedirect } from "@/components/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/lib/session";
import { AcceptInvite } from "@/pages/auth/AcceptInvite";
import { Onboarding } from "@/pages/auth/Onboarding";
import { SignIn } from "@/pages/auth/SignIn";
import { SignUp } from "@/pages/auth/SignUp";
import { CoordinatorHome } from "@/pages/coordinator/CoordinatorHome";
import { FactSheets } from "@/pages/coordinator/FactSheets";
import { Import } from "@/pages/coordinator/Import";
import { Invites } from "@/pages/coordinator/Invites";
import { Members } from "@/pages/coordinator/Members";
import { Teams } from "@/pages/coordinator/Teams";
import { ReviewQueue } from "@/pages/coordinator/ReviewQueue";
import { Brief } from "@/pages/call/Brief";
import { DonorList } from "@/pages/call/DonorList";
import { Warmth } from "@/pages/call/Warmth";
import { PostCall } from "@/pages/call/PostCall";
import { Profile } from "@/pages/volunteer/Profile";
import { VolunteerHome } from "@/pages/volunteer/VolunteerHome";
import type { ReactNode } from "react";
import { createBrowserRouter, RouterProvider, useParams } from "react-router";

// Empty routes; pre-call and post-call features arrive in Prompt P2.
function Placeholder({ title }: { title: string }) {
  const { id } = useParams();
  return <h1 className="text-2xl font-semibold">{id ? `${title} ${id}` : title}</h1>;
}

const coord = (el: ReactNode) => <CoordinatorOnly>{el}</CoordinatorOnly>;

const router = createBrowserRouter([
  { path: "/sign-in", element: <SignIn /> },
  { path: "/sign-up", element: <SignUp /> },
  { path: "/invite/:token", element: <AcceptInvite /> },
  { path: "/onboarding", element: <Onboarding /> },
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <HomeRedirect /> },
      { path: "/home", element: <VolunteerHome /> },
      { path: "/profile", element: <Profile /> },
      { path: "/coordinator", element: coord(<CoordinatorHome />) },
      { path: "/coordinator/teams", element: coord(<Teams />) },
      { path: "/coordinator/members", element: coord(<Members />) },
      { path: "/coordinator/invites", element: coord(<Invites />) },
      { path: "/coordinator/import", element: coord(<Import />) },
      { path: "/coordinator/fact-sheets", element: coord(<FactSheets />) },
      { path: "/coordinator/queue", element: coord(<ReviewQueue />) },
      { path: "/calls", element: <DonorList /> },
      { path: "/call/:donorId/brief", element: <Brief /> },
      { path: "/call/:donorId/post", element: <PostCall /> },
      { path: "/logs/:logId/warmth", element: <Warmth /> },
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
