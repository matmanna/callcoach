import type { TeamDoc } from "@sc/shared";
import { describe, expect, it } from "vitest";
import { requireCoordinator, requireRole, type Access } from "../src/auth/access.ts";
import { HttpError } from "../src/http.ts";

const team = (id: string, parent: string | null): TeamDoc => ({ _id: id, org_id: "o", name: id, focus: "", parent_team_id: parent, archived_at: null, created_at: new Date() });
function access(userType: "coordinator" | "volunteer", roles: Record<string, "coordinator" | "caller">): Access {
  return {
    user: { id: "u", email: "u@example.org", name: "U", user_type: userType, display_name: null, timezone: null },
    orgId: "o",
    roles: new Map(Object.entries(roles)),
    teams: new Map(Object.keys(roles).map((id) => [id, team(id, null)])),
    memberships: [],
  };
}
const status = (fn: () => unknown) => {
  try {
    fn();
    return 200;
  } catch (e) {
    return e instanceof HttpError ? e.status : 500;
  }
};

describe("requireRole", () => {
  it("allows the role and anything weaker", () => {
    const a = access("coordinator", { t1: "coordinator" });
    expect(status(() => requireRole(a, "t1", "coordinator"))).toBe(200);
    expect(status(() => requireRole(a, "t1", "caller"))).toBe(200);
  });
  it("403 when visible but role too weak", () => {
    expect(status(() => requireRole(access("volunteer", { t1: "caller" }), "t1", "coordinator"))).toBe(403);
  });
  it("403 for a volunteer even with a coordinator membership", () => {
    expect(status(() => requireRole(access("volunteer", { t1: "coordinator" }), "t1", "coordinator"))).toBe(403);
  });
  it("404 when the team is not visible", () => {
    expect(status(() => requireRole(access("coordinator", { t1: "coordinator" }), "t2", "caller"))).toBe(404);
  });
  it("requireCoordinator needs a coordinator user with a coordinator role", () => {
    expect(status(() => requireCoordinator(access("coordinator", { t1: "caller" })))).toBe(403);
    expect(status(() => requireCoordinator(access("coordinator", { t1: "coordinator" })))).toBe(200);
    expect(status(() => requireCoordinator({ ...access("coordinator", {}), orgId: null }))).toBe(409);
  });
});
