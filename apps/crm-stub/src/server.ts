import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { DonorFile } from "@sc/shared";
import { Hono } from "hono";

const donorPath = new URL("../../../data/donor.json", import.meta.url);
const activities = new Map<string, unknown>();
let nextId = 1;

const app = new Hono();

app.get("/donors/:id", (c) => {
  const donor = DonorFile.parse(JSON.parse(readFileSync(donorPath, "utf8")));
  if (donor.id !== c.req.param("id")) return c.json({ error: "not_found" }, 404);
  return c.json(donor);
});

// In-memory only. Stores whatever approved activity the API sends; never logs the body.
app.post("/activities", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (body === null || typeof body !== "object") return c.json({ error: "invalid_body" }, 400);
  const record_id = `crm-${String(nextId++).padStart(5, "0")}`;
  activities.set(record_id, body);
  return c.json({ record_id }, 201);
});

const port = Number(process.env.CRM_STUB_PORT ?? 8788);
serve({ fetch: app.fetch, port }, (info) => console.log(`crm-stub listening on :${info.port}`));
