/**
 * Builds the Lambda bundle exactly as infra/build-api.mjs does and invokes its handler.
 * Catches anything the bundle cannot see at runtime (for example files read from disk), which
 * only fails in Lambda otherwise.
 */
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
// Inside apps/api so the externalised @aws-sdk packages resolve (Lambda provides them at runtime).
// Two levels below the repo root keeps relative file reads from accidentally finding repo files.
const out = join(root, "apps", "api", ".lambda-test");
const dbName = `sc_lambda_${Math.random().toString(16).slice(2, 8)}`;

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("lambda bundle", () => {
  it("starts and serves requests with only what is inside the bundle", async () => {
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    await build({
      entryPoints: [join(root, "apps", "api", "src", "lambda.ts")],
      outfile: join(out, "index.mjs"),
      bundle: true,
      platform: "node",
      target: "node22",
      format: "esm",
      external: ["@aws-sdk/*"],
      banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
      logLevel: "silent",
    });
    Object.assign(process.env, {
      MONGODB_URI: `mongodb://localhost:27017/${dbName}?replicaSet=rs0&directConnection=true`,
      BETTER_AUTH_SECRET: "bundle-test-secret-0123456789abcdef0123456789",
      BETTER_AUTH_URL: "https://example.test",
      APP_ORIGIN: "https://example.test",
      MAIL_MODE: "console",
      ORIGIN_VERIFY: "verify-me",
    });
    const { handler } = (await import(pathToFileURL(join(out, "index.mjs")).href)) as { handler: (e: unknown, c?: unknown) => Promise<{ statusCode: number; body?: string }> };
    const event = (path: string, headers: Record<string, string> = {}) => ({
      version: "2.0",
      routeKey: "$default",
      rawPath: path,
      rawQueryString: "",
      headers: { host: "x.lambda-url.us-east-2.on.aws", ...headers },
      requestContext: { http: { method: "GET", path, protocol: "HTTP/1.1", sourceIp: "1.1.1.1", userAgent: "t" }, accountId: "x", apiId: "x", domainName: "x", domainPrefix: "x", requestId: "r", routeKey: "$default", stage: "$default", time: "", timeEpoch: 0 },
      isBase64Encoded: false,
    });
    expect((await handler(event("/health"), {})).statusCode).toBe(403); // no CloudFront header
    expect((await handler(event("/health", { "x-origin-verify": "verify-me" }), {})).statusCode).toBe(200);
    expect((await handler(event("/api/me", { "x-origin-verify": "verify-me" }), {})).statusCode).toBe(401);
  }, 60_000);
});
