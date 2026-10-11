import { handle } from "hono/aws-lambda";
import { createApp } from "./app.ts";
import { createDeps } from "./deps.ts";

// Connection is created once per Lambda container and reused across invocations.
const app = createApp(await createDeps());
const inner = handle(app);

/**
 * CloudFront adds a secret header to every /api request it forwards. The Function URL itself is
 * public, so requests that did not come through CloudFront (no header, wrong value) get a 403.
 * Unset ORIGIN_VERIFY disables the check (local use).
 */
const expected = process.env.ORIGIN_VERIFY;
export const handler = async (event: Parameters<typeof inner>[0], context?: Parameters<typeof inner>[1]) => {
  if (expected && (event as { headers?: Record<string, string> }).headers?.["x-origin-verify"] !== expected) {
    return { statusCode: 403, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "forbidden" }) };
  }
  return inner(event, context as never);
};
