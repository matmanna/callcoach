import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/** Preloads the body and heading fonts the landing page uses on first paint (no font CLS). */
function preloadLandingFont(): Plugin {
  return {
    name: "preload-landing-font",
    apply: "build",
    transformIndexHtml(_html, ctx) {
      const files = Object.keys(ctx.bundle ?? {}).filter((f) => /(figtree-latin-wght-normal-|FaireSprigSans-Medium-).*\.woff2$/.test(f));
      return files.map((file) => ({ tag: "link", attrs: { rel: "preload", href: `/${file}`, as: "font", type: "font/woff2", crossorigin: "" }, injectTo: "head" as const }));
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
