# Deploying Stewardship Copilot (AWS + Atlas)

Production URL: `https://callcoach.matmanna.dev` (DNS on Cloudflare). Region: `us-east-2` (the project's assigned Region; the CloudFront certificate lives in `us-east-1`).

Preview URL: `https://preview.callcoach.matmanna.dev`, stack `callcoach-preview`, secret `callcoach/preview`. Deploy it with `pnpm infra:deploy preview` and `STACK=callcoach-preview pnpm deploy:web`.

```
browser ──> CloudFront ──┬─ default: S3 (private, OAC) ─ the Vite build, SPA rewrite
 (callcoach.matmanna.dev)└─ /api/*: Lambda Function URL ─ Hono app (apps/api/src/lambda.ts) ──> MongoDB Atlas
```

- One origin for the browser, so Better Auth's session cookie is same-site and no CORS is needed.
- The Function URL is public, so CloudFront adds a secret `X-Origin-Verify` header and the handler returns 403 without it.
- Secrets live in one Secrets Manager secret, `callcoach/prod` (JSON: `MONGODB_URI`, `BETTER_AUTH_SECRET`, `ORIGIN_VERIFY`). The SAM template reads them at deploy time. They are never in git.
- No email service yet: the API returns the invite link to the coordinator, who sends it directly.

## One-time setup

1. **AWS access.** `aws configure sso --profile callcoach`, then `aws sso login --profile callcoach`. Check with `aws sts get-caller-identity --profile callcoach`.
2. **Billing alert.** Create an AWS Budget with an email alert (AGENTS.md requires one).
3. **Atlas.** Cluster, database user and connection string (see below). Atlas project API keys go in the repo's untracked `.env` as `MONGODB_PUBLIC_KEY` and `MONGODB_PRIVATE_KEY`, and the key's access list must include the machine running the setup.
4. **Secret.** Create `callcoach/prod` in Secrets Manager.
5. **Certificate.** Request an ACM certificate for the domain in `us-east-1` (DNS validation). Add the validation CNAME in Cloudflare (DNS only). Wait for `ISSUED`.
6. **Deploy the stack**, then add the Cloudflare CNAME `callcoach` -> the `DistributionDomain` output (DNS only, not proxied).
7. **Initialise the database once:** `MONGODB_URI=<prod uri> pnpm db:init`. Do not run `db:seed` or `db:seed:demo` in production. Create the first coordinator through the sign-up page.

## Bedrock

- Region follows the stack (us-east-2). `BedrockModelId` is set in `infra/samconfig.toml`; the Lambda role may invoke any foundation model or inference profile.
- Today `us.meta.llama3-3-70b-instruct-v1:0` works on this account. Anthropic models return `Model use case details have not been submitted` until the use-case form is submitted in the Bedrock console (Model catalog, Anthropic). Then switch to `us.anthropic.claude-haiku-4-5-20251001-v1:0`.
- Bedrock only sees approved structured log fields (the warmth crosscheck). Notes never leave the device.

## Every deploy

```
export AWS_PROFILE=callcoach
pnpm test && pnpm typecheck
pnpm infra:deploy prod       # or "preview"; builds the Lambda bundle, deploys the stack
pnpm deploy:web              # STACK=callcoach-preview for preview; syncs S3, invalidates index.html
```

Stack parameters (domain, cert, secret) live in `infra/samconfig.toml` per environment.

`pnpm infra:build` only bundles the Lambda (`infra/build/api/index.mjs`); `pnpm infra:validate` lints the template.

`pnpm deploy:web` also records a GitHub Deployment (`infra/gh-deploy.sh`, via `gh` auth) and a `deploy/<env>` commit status, so PRs show the deploy and the repo page shows the Deployments section. Skipped silently when `gh` is not authenticated. CI checks (`pnpm test`, `pnpm typecheck`) run in GitHub Actions (`.github/workflows/ci.yaml`). Actions cannot deploy to AWS: the org SCP denies `iam:CreateOpenIDConnectProvider`, so there is no OIDC role to assume; deploys run from a maintainer's machine.

## Rollback

- API: redeploy the previous commit with `pnpm infra:deploy`.
- Web: check out the previous commit and run `pnpm deploy:web`.
- Database changes are additive (see AGENTS.md); there is no down-migration.

## Teardown

`sam delete --stack-name callcoach --region us-east-2` (empty the S3 bucket first), then the same for `callcoach-preview`. Then delete the Cloudflare records, the ACM certificate, the secrets, and the Atlas cluster.

## Known limits

- Atlas allows `0.0.0.0/0` because Lambda has no fixed IP. Access relies on TLS and a long random database password. Tighten with a NAT gateway with a fixed IP or Atlas PrivateLink (M10 or larger) when it matters.
- Lambda connects to Atlas without a VPC, so cold starts pay a TLS handshake. The client is reused across invocations.
