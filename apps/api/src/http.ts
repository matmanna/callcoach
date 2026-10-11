import type { Context } from "hono";
import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export const notFound = () => new HttpError(404, "not_found");
export const forbidden = () => new HttpError(403, "forbidden");

/** Validation errors carry field paths and codes only, never submitted values. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, "invalid_payload", { issues: r.error.issues.map((i) => ({ path: i.path.join("."), code: i.code, message: i.message })) });
  return r.data;
}

export async function jsonBody(c: Context): Promise<unknown> {
  return c.req.json().catch(() => undefined);
}
