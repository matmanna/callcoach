import { useMemo } from "react";
import { useSearchParams } from "react-router";

/** Team selection lives in the URL (?team=ID), so pages are linkable and refreshable. */
export function useTeamScope() {
  const [params, setParams] = useSearchParams();
  const team = params.get("team") ?? "all";
  return useMemo(
    () => ({
      team,
      /** Query-string fragment for API calls; "all" sends nothing. */
      q: team === "all" ? "" : `team_id=${encodeURIComponent(team)}`,
      /** Append the team param to an in-app link. */
      link: (path: string) => {
        if (team === "all") return path;
        return `${path}${path.includes("?") ? "&" : "?"}team=${encodeURIComponent(team)}`;
      },
      setTeam: (id: string) => {
        const next = new URLSearchParams(params);
        if (id === "all") next.delete("team");
        else next.set("team", id);
        setParams(next, { replace: false });
      },
    }),
    [team, params, setParams],
  );
}

export const withQuery = (path: string, ...parts: Array<string | false | null | undefined>) => {
  const q = parts.filter(Boolean).join("&");
  return q ? `${path}${path.includes("?") ? "&" : "?"}${q}` : path;
};
