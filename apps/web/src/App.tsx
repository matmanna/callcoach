import { useEffect, useState } from "react";
import { matchLabRoute } from "./routes/lab/index.tsx";

// Minimal path router; swap for a router library only if the team agrees to add one.
type Route = { name: "gifts" } | { name: "call"; id: string } | { name: "review"; id: string } | { name: "coordinator" } | { name: "not_found" };

export function matchRoute(path: string): Route {
  if (path === "/" || path === "/gifts") return { name: "gifts" };
  if (path === "/coordinator") return { name: "coordinator" };
  const call = /^\/call\/([^/]+)$/.exec(path);
  if (call?.[1]) return { name: "call", id: decodeURIComponent(call[1]) };
  const review = /^\/review\/([^/]+)$/.exec(path);
  if (review?.[1]) return { name: "review", id: decodeURIComponent(review[1]) };
  return { name: "not_found" };
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const lab = matchLabRoute(path); // LAB ONLY: remove with apps/web/src/routes/lab
  if (lab) return lab;
  const route = matchRoute(path);
  switch (route.name) {
    case "gifts":
      return <h1>Gifts</h1>;
    case "call":
      return <h1>Call {route.id}</h1>;
    case "review":
      return <h1>Review {route.id}</h1>;
    case "coordinator":
      return <h1>Coordinator</h1>;
    case "not_found":
      return <h1>Not found</h1>;
  }
}
