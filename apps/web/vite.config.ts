import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// No React plugin: Vite's built-in transform handles TSX with the automatic JSX runtime.
export default defineConfig({
  plugins: [tailwindcss()],
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    port: 5173,
    // Same-origin /api so Better Auth's httpOnly session cookie just works in dev.
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } },
  },
});
