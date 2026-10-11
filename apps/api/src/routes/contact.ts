/**
 * POST /api/contact: landing-page contact stub (Prompt L1). Public, no session.
 * Validates and logs that a request arrived. The log carries only the coarse fields
 * (role, team size), never the person's name, email, or message.
 */
import { ContactRequest } from "@sc/shared";
import { Hono } from "hono";

export function contactRoutes(log: (line: string) => void = console.log) {
  const r = new Hono();
  r.post("/", async (c) => {
    const parsed = ContactRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return c.json({ error: "invalid_payload", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), code: i.code })) }, 400);
    }
    log(`[contact] request received team_size=${parsed.data.team_size} message_chars=${parsed.data.message.length}`);
    return c.json({ ok: true, message: "Thanks. We'll reply by email within a few working days." });
  });
  return r;
}
