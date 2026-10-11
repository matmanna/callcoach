import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SAMPLE_DONORS, SAMPLE_FACTS, SAMPLE_GIFTS, SAMPLE_RUBRIC } from "../src/sample/sampleData.ts";
import { loadAccess } from "../src/auth/access.ts";
import { seedSampleData } from "../src/services/sample.ts";
import { harness, inviteAndAccept, signUpCoordinator, type Harness } from "./helpers.ts";

let h: Harness;
const file = (name: string) => readFileSync(new URL(`../../../data/seed/${name}`, import.meta.url), "utf8");
const csv = (name: string) => Papa.parse<Record<string, string>>(file(name), { header: true, skipEmptyLines: true }).data;

beforeAll(async () => {
  h = await harness();
}, 60_000);
afterAll(async () => h?.close());

describe("sample data constants", () => {
  it("match data/seed (single source of truth for db:seed and the Lambda)", () => {
    expect(SAMPLE_DONORS).toEqual(csv("donors.csv"));
    expect(SAMPLE_GIFTS).toEqual(csv("gifts.csv"));
    expect(JSON.parse(JSON.stringify(SAMPLE_FACTS))).toEqual(JSON.parse(file("fact-sheet.json")).items);
    expect(JSON.parse(JSON.stringify(SAMPLE_RUBRIC))).toEqual(JSON.parse(file("rubric.json")));
  });
});

describe("automatic sample data for new coordinators", () => {
  it("does nothing when AUTO_SEED_SAMPLE_DATA is off (the default)", async () => {
    const off = await signUpCoordinator(h, "off@example.org", "Off Org");
    expect((await off.client.get("/api/donors")).json.donors).toEqual([]);
    expect((await off.client.get("/api/me")).json.teams[0].children).toEqual([]);
  });

  describe("when on", () => {
    beforeAll(() => {
      h.deps.env.AUTO_SEED_SAMPLE_DATA = "1";
    });
    afterAll(() => {
      delete h.deps.env.AUTO_SEED_SAMPLE_DATA;
    });

    it("seeds teams, donors, gifts, approved facts, and a rubric during onboarding", async () => {
      const s = await signUpCoordinator(h, "seeded@example.org", "Seeded Org");
      const me = (await s.client.get("/api/me")).json;
      expect(me.teams[0].children.map((t: { name: string }) => t.name).sort()).toEqual(["Alumni Callers", "Student Callers"]);
      const donors = (await s.client.get("/api/donors")).json.donors as Array<{ external_id: string; region: string }>;
      expect(donors).toHaveLength(10);
      expect(donors.every((d) => !!d.region)).toBe(true);
      const sheets = (await s.client.get("/api/fact-sheets")).json.fact_sheets;
      expect(sheets).toHaveLength(1);
      expect(sheets[0].items.map((i: { status: string }) => i.status)).toEqual(["approved", "approved", "approved"]);
      expect((await s.client.get("/api/rubrics")).json.rubrics).toHaveLength(1);
      const audit = await h.deps.db.collection("audit_log").find({ org_id: s.orgId }).toArray();
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["org.create", "import.donors", "import.gifts", "import.rubric", "fact.approve.self"]));
    });

    it("gives an invited volunteer donors to call, and each org gets its own copy", async () => {
      const a = await signUpCoordinator(h, "a@example.org", "Org A");
      const b = await signUpCoordinator(h, "b@example.org", "Org B");
      const teamId = (await a.client.get("/api/me")).json.teams[0].children.find((t: { name: string }) => t.name === "Student Callers")._id;
      const { client: vol } = await inviteAndAccept(h, a.client, teamId, "vol-a@example.org");
      const callList = (await vol.get("/api/donors")).json.donors as unknown[];
      expect(callList.length).toBeGreaterThan(0);
      expect((await b.client.get("/api/donors")).json.donors).toHaveLength(10);
      expect(await h.deps.db.collection("donors").countDocuments({ org_id: a.orgId })).toBe(10);
    });

    it("is idempotent", async () => {
      const s = await signUpCoordinator(h, "idem@example.org", "Idem Org");
      const user = (await s.client.get("/api/me")).json.user;
      const again = await seedSampleData(h.deps, user);
      expect(again.skipped).toBe("already_seeded");
      expect(await h.deps.db.collection("donors").countDocuments({ org_id: s.orgId })).toBe(10);
      expect((await loadAccess(h.deps.db, user)).orgId).toBe(s.orgId);
    });
  });
});
