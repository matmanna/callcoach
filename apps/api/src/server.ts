import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createDeps } from "./deps.ts";

const app = createApp(await createDeps());
const port = Number(process.env.API_PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => console.log(`api listening on :${info.port}`));
