# Deploying Stewardship Copilot (AWS + Atlas)

Production URL: `https://callcoach.matmanna.dev` (DNS on Cloudflare). Region: `us-east-1`.

```
browser ──> CloudFront ──┬─ default: S3 (private, OAC) ─ the Vite build, SPA rewrite
 (callcoach.matmanna.dev)└─ /api/*: Lambda Function URL ─ Hono app (apps/api/src/lambda.ts) ──> MongoDB Atlas
```

- One origin for the browser, so Better Auth's session cookie is same-site and no CORS is needed.
- The Function URL is public, so CloudFront adds a secret `X-Origin-Verify` header and the handler returns 403 without it.
- Secrets live in one Secrets Manager secret, `callcoach/prod` (JSON: `MONGODB_URI`, `BETTER_AUTH_SECRET`, `ORIGIN_VERIFY`). The SAM template reads them at deploy time. They are never in git.
- No email service yet: with `INVITE_LINK_IN_RESPONSE=1` the API returns the invite link to the coordinator, and the app copies it to the clipboard.

## One-time setup

1. **AWS access.** `aws configure sso --profile callcoach`, then `aws sso login --profile callcoach`. Check with `aws sts get-caller-identity --profile callcoach`.
2. **Billing alert.** Create an AWS Budget with an email alert (AGENTS.md requires one).
3. **Atlas.** Cluster, database user and connection string (see below). Atlas project API keys go in the repo's untracked `.env` as `MONGODB_PUBLIC_KEY` and `MONGODB_PRIVATE_KEY`, and the key's access list must include the machine running the setup.
4. **Secret.** Create `callcoach/prod` in Secrets Manager.
5. **Certificate.** Request an ACM certificate for the domain in `us-east-1` (DNS validation). Add the validation CNAME in Cloudflare (DNS only). Wait for `ISSUED`.
6. **Deploy the stack**, then add the Cloudflare CNAME `callcoach` -> the `DistributionDomain` output (DNS only, not proxied).
7. **Initialise the database once:** `MONGODB_URI=<prod uri> pnpm db:init`. Do not run `db:seed` or `db:seed:demo` in production. Create the first coordinator through the sign-up page.

## Every deploy

```
export AWS_PROFILE=callcoach
pnpm test && pnpm typecheck
pnpm infra:deploy \
  --parameter-overrides CertificateArn=<arn> BedrockModelId=<model id>   # builds the Lambda bundle, shows a change set
pnpm deploy:web                                                       # builds the web app, syncs to S3, invalidates index.html
```

`pnpm infra:build` only bundles the Lambda (`infra/build/api/index.mjs`); `pnpm infra:validate` lints the template.

## Rollback

- API: redeploy the previous commit with `pnpm infra:deploy`.
- Web: check out the previous commit and run `pnpm deploy:web`.
- Database changes are additive (see AGENTS.md); there is no down-migration.

## Teardown

`sam delete --stack-name callcoach --region us-east-1` (empty the S3 bucket first), then delete the Cloudflare records, the ACM certificate, the secret, and the Atlas cluster.

## Known limits

- Atlas allows `0.0.0.0/0` because Lambda has no fixed IP. Access relies on TLS and a long random database password. Tighten with a NAT gateway with a fixed IP or Atlas PrivateLink (M10 or larger) when it matters.
- Lambda connects to Atlas without a VPC, so cold starts pay a TLS handshake. The client is reused across invocations.
