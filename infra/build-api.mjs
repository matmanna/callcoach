/**
 * Bundles apps/api/src/lambda.ts into infra/build/api/index.mjs for the Lambda (Node 22, ESM).
 * AWS SDK v3 clients are provided by the Lambda runtime, so they stay external.
 */
import { build } from "esbuild";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "infra", "build", "api");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [join(root, "apps", "api", "src", "lambda.ts")],
  outfile: join(out, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  minify: false,
  external: ["@aws-sdk/*"],
  // Some bundled CommonJS dependencies call require().
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  logLevel: "info",
});
console.log(`built ${join(out, "index.mjs")} (${(statSync(join(out, "index.mjs")).size / 1e6).toFixed(2)} MB)`);
