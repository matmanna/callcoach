import type { TeamDoc, TeamRole, UserType } from "@sc/shared";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, api } from "./api.ts";

export interface TeamNode extends Omit<TeamDoc, "created_at" | "archived_at"> {
  created_at: string;
  archived_at: string | null;
  role: TeamRole;
  children: TeamNode[];
}

export interface Me {
  user: { id: string; email: string; name: string; user_type: UserType; display_name: string | null; timezone: string | null };
  org: { id: string; name: string; slug: string; nonprofit_status: string | null; annual_revenue_band: string | null; staff_size_band: string | null; mission: string | null; country: string | null } | null;
  onboarding_required: boolean;
  pending_invites: Array<{ id: string; role: TeamRole; team_name: string; team_focus: string; org_name: string }>;
  teams: TeamNode[];
}

interface SessionState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionState>({ me: null, loading: true, refresh: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/me"));
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) console.warn("session load failed");
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ me, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export function flattenTeams(nodes: TeamNode[], depth = 0): Array<TeamNode & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flattenTeams(n.children, depth + 1)]);
}

export const isCoordinator = (me: Me | null) => !!me && me.user.user_type === "coordinator" && flattenTeams(me.teams).some((t) => t.role === "coordinator");
