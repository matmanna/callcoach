import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";

// No React plugin: Vite's built-in transform handles TSX with the automatic JSX runtime.
export default defineConfig(({ mode }) => {
  const root = resolve(process.cwd(), "../..");
  const labEnabled = loadEnv(mode, root, "").LAB_ENABLED === "1";
  return {
    oxc: { jsx: { runtime: "automatic" as const } },
    envDir: root,
    define: { "import.meta.env.VITE_LAB_ENABLED": JSON.stringify(labEnabled) },
    plugins: [{
      name: "lab-route-gate",
      configureServer(server: { middlewares: { use(handler: (req: { url?: string }, res: { statusCode: number; end(): void }, next: () => void) => void): void } }) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split("?")[0] === "/lab/turns" && !labEnabled) { res.statusCode = 404; res.end(); return; }
          next();
        });
      },
    }],
    server: { port: 5173 },
  };
});
