import { Landing } from "@/routes/landing/Landing";
import { LegalPlaceholder } from "@/routes/landing/LegalPlaceholder";
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";

type Pages = typeof import("./appPages.tsx");

/** Lazy component from the signed-in app chunk. Every page shares one chunk. */
function page<K extends keyof Pages>(name: K) {
  return lazy(async () => ({ default: (await import("./appPages.tsx"))[name] as ComponentType<any> })) as unknown as Pages[K];
}

const SessionRoot = page("SessionRoot");
const AppLayout = page("AppLayout");
const CoordinatorOnly = page("CoordinatorOnly");
const HomeRedirect = page("HomeRedirect");
const SignIn = page("SignIn");
const SignUp = page("SignUp");
const AcceptInvite = page("AcceptInvite");
const Onboarding = page("Onboarding");
const CoordinatorHome = page("CoordinatorHome");
const FactSheets = page("FactSheets");
const Import = page("Import");
const Invites = page("Invites");
const Members = page("Members");
const Teams = page("Teams");
const ReviewQueue = page("ReviewQueue");
const Brief = page("Brief");
const DonorList = page("DonorList");
const LiveCall = page("LiveCall");
const Warmth = page("Warmth");
const PostCall = page("PostCall");
const Profile = page("Profile");
const VolunteerHome = page("VolunteerHome");
const Placeholder = page("Placeholder");

const coord = (el: ReactNode) => <CoordinatorOnly>{el}</CoordinatorOnly>;

const router = createBrowserRouter([
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
        element: <AppLayout />,
        children: [
          { path: "/app", element: <HomeRedirect /> },
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
          { path: "/call/:donorId", element: <LiveCall /> },
          { path: "/review/:id", element: <Placeholder title="Review" /> },
          { path: "*", element: <Placeholder title="Not found" /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
