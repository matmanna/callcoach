import { ApprovePayload, FlagResult } from "@sc/shared";
import { Hono } from "hono";
import type { z } from "zod";
import { labRoutes } from "./routes/lab/index.ts";

export const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));
app.route("/lab", labRoutes);

/** Error body lists field paths and issue codes only, never submitted values. */
function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), code: i.code }));
}

// Stub. Core owner implements in routes/approve.ts.
app.post("/approve", async (c) => {
  const parsed = ApprovePayload.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid_payload", issues: issues(parsed.error) }, 400);
  return c.json({ error: "not_implemented" }, 501);
});

// Stub. Core owner implements in routes/flag.ts.
app.post("/flag", async (c) => {
  const parsed = FlagResult.safeParse(await c.req.json().catch(() => undefined));
  if (!parsed.success) return c.json({ error: "invalid_payload", issues: issues(parsed.error) }, 400);
  return c.json({ error: "not_implemented" }, 501);
});
