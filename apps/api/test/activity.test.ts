import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACTIVITY_RETENTION_DAYS } from "../src/db/init.ts";
import { activityHeatmap, recordActivity } from "../src/services/activity.ts";
import { harness, signUpCoordinator, type Harness } from "./helpers.ts";

let h: Harness;
beforeAll(async () => {
  h = await harness();
}, 60_000);
afterAll(async () => h?.close());

const DAY = 86_400_000;
const utcDay = (offset: number, hour = 12) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset, hour));
};

describe("call activity time series", () => {
  it("is created as a time series collection with hourly buckets and the retention window", async () => {
    const [info] = await h.deps.db.listCollections({ name: "call_activity" }).toArray();
    const options = (info as unknown as { options: { timeseries?: { granularity?: string; timeField?: string; metaField?: string }; expireAfterSeconds?: number } }).options;
    expect(options.timeseries).toMatchObject({ timeField: "at", metaField: "meta", granularity: "hours" });
    expect(options.expireAfterSeconds).toBe(ACTIVITY_RETENTION_DAYS * 86_400);
  });

  it("counts approved calls per UTC day and hides days under five", async () => {
    const s = await signUpCoordinator(h, "heat@example.org", "Heat Org");
    for (let i = 0; i < 6; i += 1) await recordActivity(h.deps, undefined as never, { orgId: s.orgId, teamId: s.rootTeamId, callerId: "vol-1", at: utcDay(0, 8 + i) });
    for (let i = 0; i < 2; i += 1) await recordActivity(h.deps, undefined as never, { orgId: s.orgId, teamId: s.rootTeamId, callerId: "vol-1", at: utcDay(-1, 9 + i) });
    const map = await activityHeatmap(h.deps, { orgId: s.orgId, teamIds: null }, 30);
    expect(map.days).toHaveLength(30);
    const today = map.days.at(-1)!;
    const yesterday = map.days.at(-2)!;
    expect(today).toMatchObject({ count: 6, some: false });
    expect(yesterday).toMatchObject({ count: null, some: true });
    expect(map.days.find((d) => d.count === null && !d.some)).toBeTruthy();
    expect(map.total).toEqual({ n: 8 });
  });

  it("scopes to a person or to teams, and never leaks another organization", async () => {
    const a = await signUpCoordinator(h, "scope-a@example.org", "Scope A");
    const b = await signUpCoordinator(h, "scope-b@example.org", "Scope B");
    for (let i = 0; i < 5; i += 1) await recordActivity(h.deps, undefined as never, { orgId: a.orgId, teamId: a.rootTeamId, callerId: "vol-a", at: utcDay(0, 8 + i) });
    await recordActivity(h.deps, undefined as never, { orgId: b.orgId, teamId: b.rootTeamId, callerId: "vol-b", at: utcDay(0) });
    expect((await activityHeatmap(h.deps, { orgId: a.orgId, teamIds: null, callerId: "vol-a" }, 7)).total).toEqual({ n: 5 });
    expect((await activityHeatmap(h.deps, { orgId: a.orgId, teamIds: null, callerId: "vol-b" }, 7)).total).toEqual({ suppressed: true });
    expect((await activityHeatmap(h.deps, { orgId: a.orgId, teamIds: [b.rootTeamId] }, 7)).total).toEqual({ suppressed: true });
  });

  it("covers the full window with zero-activity days so the grid has no holes", async () => {
    const s = await signUpCoordinator(h, "empty@example.org", "Empty Org");
    const map = await activityHeatmap(h.deps, { orgId: s.orgId, teamIds: null }, 365, utcDay(0));
    expect(map.days).toHaveLength(365);
    expect(map.total).toEqual({ suppressed: true });
    expect(new Set(map.days.map((d) => d.date)).size).toBe(365);
  });
});
