/** LAB ONLY. Every lab route is 404 unless LAB_ENABLED=1. Delete this folder to remove the lab. */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { redactLab } from "./redact.ts";

export function labRoutes(env: NodeJS.ProcessEnv = process.env) {
  const lab = new Hono();
  lab.use("*", async (c, next) => {
    if (env.LAB_ENABLED !== "1") return c.notFound();
    await next();
  });
  // The lab UI runs on the Vite dev server (or the Tauri webview) on another origin.
  lab.use("*", cors({ origin: ["http://localhost:5173", "tauri://localhost", "http://tauri.localhost"], allowHeaders: ["content-type", "x-lab-run-id"] }));
  lab.route("/redact", redactLab({ env }));
  return lab;
}
