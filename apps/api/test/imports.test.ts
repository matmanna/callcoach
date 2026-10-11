import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, harness, seedFile, signUpCoordinator, type Harness } from "./helpers.ts";

let h: Harness;
let coord: Client;

beforeAll(async () => {
  h = await harness();
  ({ client: coord } = await signUpCoordinator(h, "imp@example.org", "Import Org"));
  await coord.post("/api/teams", { name: "Student Callers", focus: "" });
  await coord.post("/api/teams", { name: "Alumni Callers", focus: "" });
}, 60_000);
afterAll(async () => h?.close());

const BAD = `${seedFile("donors.csv").trim()}
d-301,Ada,,,,,Spring Youth Appeal 2026,$1-$49,1,$1-$49,,Student Callers
d-302,Bo,Smith,,,,Spring Youth Appeal 2026,$1-$49,1,$1-$49,,Nonexistent Team
d-201,Dup,Licate,,,,Spring Youth Appeal 2026,$1-$49,1,$1-$49,,Student Callers
`;

describe("donor import", () => {
  it("preview validates rows server-side and shows up to 20", async () => {
    const p = await coord.post("/api/imports/donors/preview", { file_name: "donors.csv", content: BAD });
    expect(p.status).toBe(200);
    expect(p.json.total_rows).toBe(13);
    expect(p.json.valid_rows).toBe(10);
    expect(p.json.rows.length).toBe(13);
    expect(p.json.missing_columns).toEqual([]);
  });

  it("commit rejects bad rows with reasons and offers a rejects CSV", async () => {
    const r = await coord.post("/api/imports/donors/commit", { file_name: "donors.csv", content: BAD });
    expect(r.status).toBe(201);
    const run = r.json.seed_run;
    expect([run.accepted_count, run.rejected_count]).toEqual([10, 3]);
    const reasons = run.rejected_rows.map((x: { reasons: string[] }) => x.reasons.join(" | "));
    expect(reasons[0]).toMatch(/last_name/);
    expect(reasons[1]).toMatch(/no team named "Nonexistent Team"/);
    expect(reasons[2]).toMatch(/duplicate in this file/);
    const csv = await coord.get(`/api/seed-runs/${run._id}/rejects.csv`);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.text.split("\n")[0]).toContain("reasons");
    expect(csv.text).toContain("Nonexistent Team");
    const audit = await h.deps.db.collection("audit_log").find({ target_id: run._id }).toArray();
    expect(audit.map((a) => a.action)).toEqual(["import.donors"]);
  });

  it("re-import of an existing external_id is rejected unless update_existing is confirmed", async () => {
    const one = `external_id,first_name,last_name,campaign,gift_band,past_gift_count,last_gift_band,team_name\nd-102,Rosalind,Featherstone-Updated,Spring Youth Appeal 2026,$100-$249,8,$100-$249,Student Callers\n`;
    const no = (await coord.post("/api/imports/donors/commit", { file_name: "u.csv", content: one })).json.seed_run;
    expect([no.updated_count, no.rejected_count]).toEqual([0, 1]);
    const yes = (await coord.post("/api/imports/donors/commit", { file_name: "u.csv", content: one, update_existing: true })).json.seed_run;
    expect(yes.updated_count).toBe(1);
    const d = (await coord.get("/api/donors")).json.donors.find((x: { external_id: string }) => x.external_id === "d-102");
    expect(d.last_name).toBe("Featherstone-Updated");
  });

  it("maps differently named columns", async () => {
    const csv = `ID,First,Last,Campaign,Band,Count,Last Band,Team\nd-401,Cy,Moss,Spring Youth Appeal 2026,$1-$49,1,$1-$49,Alumni Callers\n`;
    const mapping = { external_id: "ID", first_name: "First", last_name: "Last", campaign: "Campaign", gift_band: "Band", past_gift_count: "Count", last_gift_band: "Last Band", team_name: "Team" };
    const r = (await coord.post("/api/imports/donors/commit", { file_name: "m.csv", content: csv, mapping })).json.seed_run;
    expect(r.accepted_count).toBe(1);
  });

  it("refuses files with transcript, audio, or notes_raw columns, recording a failed run", async () => {
    for (const col of ["transcript", "call_audio", "notes_raw"]) {
      const r = await coord.post("/api/imports/donors/commit", { file_name: "x.csv", content: `external_id,${col}\nd-9,something\n` });
      expect(r.status).toBe(422);
      expect(r.json).toEqual({ error: "forbidden_column", columns: [col] });
      expect(r.text).not.toContain("something");
    }
    const runs = (await coord.get("/api/seed-runs")).json.seed_runs.filter((s: { status: string }) => s.status === "failed");
    expect(runs.length).toBe(3);
  });
});

describe("gifts, fact sheet, rubric", () => {
  it("gifts require an existing donor", async () => {
    const content = `${seedFile("gifts.csv").trim()}\ng-9999,d-nope,$1-$49,Spring Youth Appeal 2026,2026-01-01\n`;
    const r = (await coord.post("/api/imports/gifts/commit", { file_name: "gifts.csv", content })).json.seed_run;
    expect([r.accepted_count, r.rejected_count]).toEqual([10, 1]);
  });

  it("fact sheet CSV: items missing source or verified_on are rejected; accepted items start as draft", async () => {
    const content = `text,source,verified_on,owner_email\nGood fact,Annual report,2026-09-01,\nNo source,,2026-09-01,\nNo date,Report,,\nBad owner,Report,2026-09-01,nobody@example.org\n`;
    const r = (await coord.post("/api/imports/fact_sheet/commit", { file_name: "facts.csv", content })).json.seed_run;
    expect([r.accepted_count, r.rejected_count]).toEqual([1, 3]);
    const sheet = (await coord.get("/api/fact-sheets")).json.fact_sheets.find((s: { name: string }) => s.name === "facts.csv");
    expect(sheet.items[0].status).toBe("draft");
  });

  it("rubric must be JSON matching the schema", async () => {
    expect((await coord.post("/api/imports/rubric/commit", { file_name: "r.csv", content: "a,b\n1,2\n" })).status).toBe(422);
    const ok = (await coord.post("/api/imports/rubric/commit", { file_name: "rubric.json", content: seedFile("rubric.json"), team_id: null })).json.seed_run;
    expect(ok.accepted_count).toBe(1);
    const bad = (await coord.post("/api/imports/rubric/commit", { file_name: "r.json", content: JSON.stringify({ items: [{ id: "x", text: "t", supporting_tags: ["NOT_A_TAG"] }] }) })).json.seed_run;
    expect(bad.rejected_count).toBe(1);
  });
});
