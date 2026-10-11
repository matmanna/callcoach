# AGENTS.md

Instructions for any AI agent or human working in this repo. Read this before changing anything.

## What this project is

**Stewardship Copilot** is a hackathon app (8-hour build, Oct 11, 2026) that helps a volunteer make a donor thank-you call and keeps the call private. A transcript is scrubbed in the browser, the volunteer approves a short abstracted note, and only that note goes to the server. Bedrock reads the approved note and proposes flags. A coordinator decides every action.

The one-sentence angle: **nothing leaves the volunteer's device until a person has approved it, and a ledger shows exactly what was sent.**

## Invariants (never break these)

1. **Raw transcript text never leaves the browser.** It is never sent, stored in the database, logged, or put in a fixture outside `data/` and tests. The `Turn` type has no `raw` field on purpose. `RawTurn` exists only in client memory.
2. **The approve payload is the only thing sent after a call.** It is validated with the strict `ApprovePayload` schema. The ledger is generated from the same object that is sent.
3. **The server rejects identifiers before any model call.** The PII guard runs first. Errors return counts and types only, never the offending text.
4. **The AI never talks to a donor,** never writes to a donor record, and never takes an action. Flags and rubric results are suggestions. A coordinator decides.
5. **No quotes from calls are stored or returned.** Model inputs are the approved summary and tags only.
6. **No per-volunteer rankings.** Never average the volunteer's and the model's warmth scores. Hide any breakdown with fewer than 5 items.
7. **Synthetic data only.** No real donor, volunteer, or nonprofit data anywhere in the repo, in tests, or in prompts.
8. **Cues answer the donor, never push an ask.** No persuasion prompts. Fact cards come only from the nonprofit-approved fact sheet and show source and date.
9. **Honesty in copy.** No causal claims about retention or revenue. Say "reported by" for third-party figures. Do not claim "offline" or "audio never leaves the device" unless that path was actually run that way.

## Stack

- TypeScript, strict mode, everywhere. **No Python.** Do not add a language or a framework without asking.
- pnpm workspaces. Node 20+.
- Web: Vite, React, TypeScript, Tailwind, shadcn/ui (use its components; do not hand-roll what it provides), React Router.
- API: Hono on Node locally; the same app is exported as a Lambda handler from `apps/api/src/lambda.ts`.
- Validation: Zod. Schemas live in `packages/shared`.
- DB: MongoDB (Atlas, or a local single-node replica set via Docker for dev) with the official `mongodb` driver.
- Auth: Better Auth (email and password) with the MongoDB adapter, mounted at `/api/auth/*`. User type (`coordinator` | `volunteer`) lives on the user; team membership is separate.
- AWS: Bedrock Converse API via `@aws-sdk/client-bedrock-runtime`; Comprehend optional.
- Tests: Vitest.
- Out of scope for the hackathon: Tauri, Rust, Python, Presidio, vector search, Cognito, Step Functions.

## Repo layout

```
apps/web/          React app: gifts, call, review, coordinator
apps/api/          Hono routes, db, services
apps/crm-stub/     CRM-shaped stub: GET /donors/:id, POST /activities
packages/shared/   Zod schemas, enums, types (single source of truth)
packages/rules/    Pure functions: redact.ts, cues.ts, tags.ts, guard.ts, rubric.ts
data/              Synthetic fixtures and rule files
infra/             SAM template
```

## Commands

```
pnpm install
docker compose up -d
pnpm db:init && pnpm db:seed
pnpm dev          # web :5173, api :8787, crm-stub :8788
pnpm test
pnpm typecheck
```

## Conventions

- **`packages/rules` is pure.** No I/O, no network, no `Date.now()`, no randomness. Time comes from `turn.t`. Functions return new state and never mutate inputs.
- **One source of truth for types.** Enums and schemas are defined in `packages/shared` and imported everywhere. Do not redefine an enum in the API or web app.
- **One source of truth for identifier regexes.** `redact.ts` and `guard.ts` share one module so they cannot drift.
- **Rules and facts are data.** Cue rules, phrase rules, the fact sheet, and the rubric live in `data/*.json`, validated by Zod at load. Do not hardcode trigger phrases in code.
- **Server returns IDs, browser renders text** for cues, if server-side rule matching is ever used.
- **Idempotency.** Approve is keyed by `idempotency_key`. A repeat returns the stored result and does not call Bedrock or the CRM again.
- **Failure is visible.** If Bedrock returns invalid JSON, store zero flags, set `flags_failed`, and show the coordinator an error. Never fail silently and never guess.
- **Model output is untrusted.** Parse with Zod, drop labels outside the enum, truncate reasons to 160 characters.
- **Audit log is append-only.** No update or delete routes. The application layer only exposes append and read for `audit_log`, and the app's MongoDB role has no update or delete privilege on that collection.

## Database

- MongoDB documents, not migrations. Every collection has a TypeScript type and Zod schema in `packages/shared`. `pnpm db:init` creates collections, indexes, and the app role, and is safe to re-run.
- Schema changes are tracked in the `schema_versions` collection: bump the version in `apps/api/src/db/init.ts`, keep changes additive (new optional fields, new indexes), and mention it in your report.
- Repository functions take `org_id` as an explicit argument. Never query a tenant collection without it.
- There is no transcript, raw-text, or audio field, and none may be added.

## Ownership (avoid merge conflicts)

| Area | Owner | Files |
|---|---|---|
| Scaffold, schemas, rule engine | Scaffold agent, then core owner | `packages/shared`, `packages/rules` (except `rubric.ts`), `apps/api/src/db`, `data/*` (except `rubric.json`) |
| Core spine | Core owner | call, review, and ledger routes in `apps/web`; `apps/api/src/routes/approve.ts`, `flag.ts` |
| Coordinator tier | Person 1 | `apps/web/src/routes/coordinator/**`, `Metrics*.tsx`, `routes/audit.ts`, `metrics.ts`, `flags.ts`, `packages/shared/src/coordinator.ts` |
| Post-call tier | Person 2 | `packages/rules/src/rubric.ts`, `Rubric*.tsx`, `Warmth*.tsx`, `routes/rubric.ts`, `warmth.ts`, `services/llmRate.ts`, `data/rubric.json`, `packages/shared/src/rubric.ts`, `warmth.ts` |

If you need a change in a file you don't own, make the smallest possible edit, keep it backward compatible, and say so in your report. Do not reformat or reorganize files you don't own.

## Testing expectations

- Every rule function has unit tests. Redaction has a **leak test**: run the scripted transcript through `redactTurn` and assert that none of the values in `data/planted.json` survive. Report the result as `planted identifiers surviving redaction: 0 of N`.
- Every data file has a validation test.
- Anything that calls Bedrock gets a unit test with a mocked client for valid output, malformed JSON, and an out-of-enum label.
- Do not mark work done if tests fail or `pnpm typecheck` fails.

## Security and AWS

- Never commit credentials. Use `.env` (gitignored) and keep `.env.example` current.
- Use a least-privilege IAM profile. Bedrock model access must be enabled for the chosen region and model before the first call.
- Do not claim anything about AWS data retention or training. Link to current AWS documentation instead.
- Keep a billing alert on the AWS account.

## Definition of done

A change is done when:
1. It meets the acceptance criteria in its prompt.
2. `pnpm test` and `pnpm typecheck` pass.
3. It does not violate any invariant above.
4. It runs in the demo path, or it is clearly marked as a stub in the UI and the report.
5. Your report lists files changed, tests run, deviations from the spec, and anything unresolved.

## When in doubt

- Prefer the simplest thing that works end to end over a more complete thing that doesn't.
- If the spec is ambiguous, choose the simplest reading, note it in the report, and keep going.
- If a requirement would break an invariant, stop and ask rather than working around it.
- Cut scope before cutting the consent gate, the ledger, the PII guard, or the CSV export.
