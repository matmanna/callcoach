import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/** Preloads the landing page's Latin Figtree file so the headline renders in it on first paint (no font CLS). */
function preloadLandingFont(): Plugin {
  return {
    name: "preload-landing-font",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      const file = Object.keys(ctx.bundle ?? {}).find((f) => /figtree-latin-wght-normal-.*\.woff2$/.test(f));
      if (!file) return [];
      return [{ tag: "link", attrs: { rel: "preload", href: `/${file}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head" }];
    },
  };
}

// No React plugin: Vite's built-in transform handles TSX with the automatic JSX runtime.
export default defineConfig({
  plugins: [tailwindcss(), preloadLandingFont()],
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    port: 5173,
    // Same-origin /api so Better Auth's httpOnly session cookie just works in dev.
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
  },
});
