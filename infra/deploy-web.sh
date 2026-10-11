#!/usr/bin/env bash
# Build the web app and publish it to S3, then invalidate CloudFront.
# Usage: AWS_PROFILE=callcoach STACK=callcoach|callcoach-preview infra/deploy-web.sh
# Optional: WEB_DIST=<dir> publishes an existing build instead of building this checkout.
set -euo pipefail
cd "$(dirname "$0")/.."
STACK="${STACK:-callcoach}"
REGION="${AWS_REGION:-us-east-2}"
# callcoach -> production, callcoach-preview -> preview (GitHub environment names).
ENV_NAME="${STACK#callcoach}"; ENV_NAME="${ENV_NAME#-}"; ENV_NAME="${ENV_NAME:-production}"

out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET="$(out WebBucketName)"
DIST="$(out DistributionId)"
URL="https://$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Parameters[?ParameterKey=='DomainName'].ParameterValue" --output text)"

DEPLOY_ID="$(infra/gh-deploy.sh start "$ENV_NAME" "$URL")" || DEPLOY_ID=""
trap '[ $? -eq 0 ] || infra/gh-deploy.sh finish "$ENV_NAME" "$URL" "$DEPLOY_ID" failure' EXIT

if [ -n "${WEB_DIST:-}" ]; then
  DIST_DIR="$WEB_DIST"
else
  # The call flow runs Whisper and NER on the device from same-origin files (no CDN), so ship them.
  pnpm models:fetch
  pnpm --filter @sc/web build
  DIST_DIR="apps/web/dist"
fi
# Hashed assets are immutable; index.html must always revalidate.
aws s3 sync "$DIST_DIR" "s3://$BUCKET" --delete --region "$REGION" --exclude index.html --cache-control "public,max-age=31536000,immutable"
aws s3 cp "$DIST_DIR/index.html" "s3://$BUCKET/index.html" --region "$REGION" --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" --query "Invalidation.Id" --output text

infra/gh-deploy.sh finish "$ENV_NAME" "$URL" "$DEPLOY_ID" success
echo "published to $URL"
