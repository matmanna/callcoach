# P2 pre-call and post-call platform

## Branch and S2 foundation

This work is on `codex/pre-post-call`, based on main after S2 merged. The existing P2 rules/schema commit was cherry-picked as a starting point. Better Auth sessions, `requireRole`, memberships, donors, campaigns, fact sheets, and rubrics remain S2-owned. P2 adds only optional team timezone data to S2 schemas and service creation so overdue dates use the team's calendar; old teams inherit from their parent or org creator. The S2 seed now marks one synthetic fact approved under the coordinator identity and writes an audit row, so the demo brief has a sourced fact on first use.

## Changed files

- API: `apps/api/src/db/{collections,init,seed}.ts`, `apps/api/src/routes/{api,postcall}.ts`, `apps/api/src/services/{brief,context,orgs,teams,postcallGuard,postcallModel,teamTimezone}.ts`, `apps/api/test/{postcall,postcall-model}.test.ts`.
- Web: `apps/web/src/{App,components/AppLayout}.tsx`, `apps/web/src/pages/call/{Brief,DonorList,PostCall,Warmth}.tsx`, `apps/web/src/pages/coordinator/ReviewQueue.tsx`.
- Shared and rules: `packages/shared/src/{identity,postcall}.ts`, `packages/rules/src/{index,logDraft,note,overdue}.ts`, `packages/rules/test/{logDraft,note,overdue}.test.ts`, `data/log-rules.json`.
- Configuration: `.env.example`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`.

## API and collections

New endpoints under `/api`: `GET /donors/:id/brief`, `POST /donors/:id/logs/start`, `GET /logs/:id`, `POST /logs/:id/approve`, `GET|POST /logs/:id/warmth`, `GET /follow-ups/:id`, `POST /follow-ups/:id/{complete,handoff,cancel}`, `GET /teams/:id/handoff-members`, `GET /coordinator/queue`, `POST /flags/:id/{approve,override,resolve}`, and `POST /pending-limits/:id/{approve,reject}`.

Schema version 2 adds typed collections `call_logs`, `call_flags`, `pending_limits`, `follow_ups`, and `warmth_ratings`, with org-scoped indexes and unique idempotency/rating indexes. `audit_log` remains append-only and each approval, follow-up action, flag decision, and limit decision writes one row in the same transaction as its state change. No transcript, audio, or raw call-note field was added. The browser's note is held in memory; its structured approval payload is the only call content sent to the API.

The brief filters by org, assigned team, campaign fact-sheet IDs, and approved status. It returns the newest three approved logs and flags stale facts using `FACT_STALE_DAYS` (default 365). Follow-up overdue state uses the team's IANA timezone and sends no notification. Warmth is stored per call and caller; the caller and model scores remain separate, and a gap of two shows the discussion prompt.

## Verification

- `CI=true pnpm typecheck`: passed across all workspace projects.
- `CI=true pnpm test`: 14 files, 125 tests passed with a temporary local MongoDB replica set. Bedrock was mocked; no test called AWS.
- `CI=true pnpm --filter @sc/web build`: passed (Vite reported existing bundle-size and module-directive warnings).
- `CI=true pnpm install --frozen-lockfile`: passed its supply-chain policy check after pinning Vitest's compatible `tinybench` to 6.1.4 in the workspace override.
- Synthetic seed smoke check: 10 donors, one approved fact with source and verification date. Browser walkthrough showed brief, local scrub/draft, approval, proposed flag and pending limit queue, follow-up completion, and warmth input. The actual approved MongoDB log and follow-up contained neither the typed note nor its planted phone number; one `log.approve` audit row was present.

## Bedrock prompt text

Draft (optional, not currently wired to a note transport):

> Return only JSON with donor_stated_reason (string, at most 160 characters) and follow_up_action (string, at most 120 characters). Use only the scrubbed note. Prefer a short stated reason code. Do not infer finances, health, family status, or intent. Do not include identifiers or quotes.

Warmth crosscheck (one Converse call after approval when configured):

> Return only JSON with score (integer 1-5) and reason (string, at most 160 characters). Use only the approved structured log fields, with these anchors: {"1":"Cold: short or strained; the donor wanted off the call.","2":"Cool: polite but distant.","3":"Neutral: friendly enough, little connection.","4":"Warm: easy conversation; the donor engaged.","5":"Very warm: real connection; the donor shared and thanked."}. Do not infer finances, health, family status, or intent. Do not include identifiers or quotes.

## Open consent choice

The user prompt asks the API to receive a scrubbed short note before approval so Bedrock can refine the draft. `AGENTS.md` says nothing leaves the caller's device until a person approves it and that the approve payload is the only post-call content sent. The current browser path applies deterministic rules locally and sends only approved structured fields. The optional API note-to-model draft route is intentionally deferred pending the user's explicit choice on this conflict. The model draft helper is isolated and tested for malformed and extra-key output but is not invoked by the current browser path.

Deterministic flags are labeled “Suggested by rules, needs review” in the queue. The requested “Suggested by model” label would be inaccurate for those flags.
