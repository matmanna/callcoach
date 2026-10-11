import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Web component tests (.test.tsx) opt into jsdom per file with `// @vitest-environment jsdom`.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "apps/web/src") } },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "apps/*/test/**/*.test.tsx"],
  },
});
