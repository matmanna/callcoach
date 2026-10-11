import { handle } from "hono/aws-lambda";
import { createApp } from "./app.ts";
import { createDeps } from "./deps.ts";

// Connection is created once per Lambda container and reused across invocations.
const app = createApp(await createDeps());
export const handler = handle(app);
