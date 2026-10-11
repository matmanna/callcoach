import { defineConfig } from "vite";

// No React plugin: Vite's built-in transform handles TSX with the automatic JSX runtime.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  server: { port: 5173 },
});
