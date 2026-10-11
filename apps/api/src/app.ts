import { ApprovePayload, FlagResult } from "@sc/shared";
import { Hono } from "hono";
import type { z } from "zod";
import { HttpError } from "./http.ts";
import { apiRoutes } from "./routes/api.ts";
import { contactRoutes } from "./routes/contact.ts";
import type { Deps } from "./services/context.ts";

/** Error body lists field paths and issue codes only, never submitted values. */
function issues(error: z.ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), code: i.code }));
}

export function createApp(deps: Deps) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code, ...err.extra }, err.status);
    console.error("[api] unhandled", err instanceof Error ? err.name : "error");
    return c.json({ error: "internal" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // Better Auth owns /api/auth/* (sign-up, sign-in, sign-out, session, change-password).
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));
  // Public landing-page contact stub; registered before /api so the session middleware never sees it.
  app.route("/api/contact", contactRoutes());
  app.route("/api", apiRoutes(deps));

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

  return app;
}
