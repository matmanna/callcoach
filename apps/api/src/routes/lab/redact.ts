/** LAB ONLY (Prompt D). POST /lab/redact/send and /lab/redact/guard. No DB writes. */
import { ComprehendClient, DetectPiiEntitiesCommand } from "@aws-sdk/client-comprehend";
import { scanForIdentifiers } from "@sc/rules";
import { Tag } from "@sc/shared";
import { Hono } from "hono";
import { z } from "zod";
import { bedrockModelId, createBedrockClient } from "../../bedrock.ts";
import { CallBudget, MAX_CONCURRENCY, Semaphore, flagNote, type FlagDeps, type LabInput } from "../../services/lab/bedrockNote.ts";

// Strict: unknown keys (including `raw`) are rejected with 400.
export const SendBody = z
  .strictObject({
    variant: z.enum(["M", "A", "N"]),
    text: z.string().min(1).max(20_000).optional(),
    summary: z.string().max(400).optional(),
    tags: z.array(Tag).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.variant === "N") {
      if (b.summary === undefined) ctx.addIssue({ code: "custom", path: ["summary"], message: "required for N" });
      if (b.tags === undefined) ctx.addIssue({ code: "custom", path: ["tags"], message: "required for N" });
      if (b.text !== undefined) ctx.addIssue({ code: "custom", path: ["text"], message: "not allowed for N" });
    } else {
      if (b.text === undefined) ctx.addIssue({ code: "custom", path: ["text"], message: `required for ${b.variant}` });
      if (b.summary !== undefined || b.tags !== undefined) ctx.addIssue({ code: "custom", path: ["summary"], message: `not allowed for ${b.variant}` });
    }
  });

const GuardBody = z.strictObject({ text: z.string().max(20_000) });

const issues = (e: z.ZodError) => e.issues.map((i) => ({ path: i.path.join("."), code: i.code }));

export interface RedactLabOptions {
  env?: NodeJS.ProcessEnv;
  /** Injected in tests. */
  deps?: Partial<FlagDeps>;
  comprehend?: { send(cmd: DetectPiiEntitiesCommand): Promise<{ Entities?: { Type?: string }[] }> } | null;
}

export function redactLab(opts: RedactLabOptions = {}) {
  const env = opts.env ?? process.env;
  const maxCalls = Number(env.LAB_MAX_BEDROCK_CALLS ?? 40) || 40;
  const budgets = new Map<string, CallBudget>();
  const semaphore = new Semaphore(MAX_CONCURRENCY);
  const mock = env.MOCK_BEDROCK === "1";
  let client: FlagDeps["client"] | undefined;
  let comprehend = opts.comprehend;

  const app = new Hono();

  app.post("/send", async (c) => {
    const parsed = SendBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid_payload", issues: issues(parsed.error) }, 400);
    const b = parsed.data;
    const input: LabInput = b.variant === "N" ? { variant: "N", summary: b.summary ?? "", tags: b.tags ?? [] } : { variant: b.variant, text: b.text ?? "" };

    // One budget per run; the UI sends a fresh run id for each "Run all".
    const runId = (c.req.header("x-lab-run-id") ?? "default").slice(0, 64);
    let budget = budgets.get(runId);
    if (!budget) budgets.set(runId, (budget = new CallBudget(maxCalls)));

    if (!mock && !opts.deps?.client && client === undefined) {
      try {
        client = createBedrockClient(env);
      } catch {
        client = undefined;
      }
    }
    let modelId: string | undefined;
    try {
      modelId = bedrockModelId(env);
    } catch {
      modelId = undefined;
    }
    const result = await flagNote(input, { mock, client, modelId, budget, semaphore, ...opts.deps });
    const status = result.status === "blocked" ? 422 : result.status === "capped" ? 429 : result.status === "error" ? 502 : 200;
    return c.json(
      {
        status: result.status,
        flags: result.flags,
        ...(result.status === "invalid" ? { invalid: true } : {}),
        dropped_labels: result.dropped_labels,
        latency_ms: result.latency_ms,
        response_latency_ms: result.response_latency_ms,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        payload_chars: result.payload_chars,
        guard_counts: result.guard_counts,
        mock: result.mock,
        ...(result.error ? { error: result.error } : {}),
      },
      status,
    );
  });

  app.post("/guard", async (c) => {
    const parsed = GuardBody.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json({ error: "invalid_payload", issues: issues(parsed.error) }, 400);
    const counts = scanForIdentifiers(parsed.data.text);
    let comprehendCounts: Record<string, number> | null = null;
    if (env.COMPREHEND_ENABLED === "1" && parsed.data.text.length > 0) {
      try {
        if (comprehend === undefined) comprehend = new ComprehendClient({ region: env.AWS_REGION });
        if (comprehend) {
          const out = await comprehend.send(new DetectPiiEntitiesCommand({ Text: parsed.data.text, LanguageCode: "en" }));
          // Entity types and counts only, never offsets or text.
          comprehendCounts = {};
          for (const e of out.Entities ?? []) if (e.Type) comprehendCounts[e.Type] = (comprehendCounts[e.Type] ?? 0) + 1;
        }
      } catch {
        comprehendCounts = null;
      }
    }
    return c.json({ guard_counts: counts, comprehend: comprehendCounts });
  });

  return app;
}
