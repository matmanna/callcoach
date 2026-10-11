import { collections } from "../db/collections.ts";
import type { TeamDoc } from "@sc/shared";
import type { Deps } from "./context.ts";
import { toUserKey } from "./orgs.ts";

/** S2 teams predate the timezone field; inherit their parent or org creator's timezone. */
export async function teamTimezone(deps: Deps, orgId: string, teamId: string): Promise<string> {
  const c = collections(deps.db);
  let current: string | null = teamId;
  for (let hops = 0; current && hops < 10; hops++) {
    const team: TeamDoc | null = await c.teams.findOne({ _id: current, org_id: orgId });
    if (!team) break;
    if (team.timezone) return team.timezone;
    current = team.parent_team_id;
  }
  const org = await c.organizations.findOne({ _id: orgId });
  const creator = org ? await c.users.findOne({ _id: toUserKey(org.created_by) }) : null;
  return creator?.timezone ?? "UTC";
}
