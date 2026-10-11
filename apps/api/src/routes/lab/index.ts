import { Hono } from "hono";
import { labTurns } from "./turns.ts";
export const labRoutes = new Hono();
labRoutes.route("/", labTurns);
