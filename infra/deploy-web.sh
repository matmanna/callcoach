#!/usr/bin/env bash
# Build the web app and publish it to S3, then invalidate CloudFront.
# Usage: AWS_PROFILE=callcoach infra/deploy-web.sh
set -euo pipefail
cd "$(dirname "$0")/.."
STACK="${STACK:-callcoach}"
REGION="${AWS_REGION:-us-east-1}"

out() { aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET="$(out WebBucketName)"
DIST="$(out DistributionId)"

pnpm --filter @sc/web build
# Hashed assets are immutable; index.html must always revalidate.
aws s3 sync apps/web/dist "s3://$BUCKET" --delete --region "$REGION" --exclude index.html --cache-control "public,max-age=31536000,immutable"
aws s3 cp apps/web/dist/index.html "s3://$BUCKET/index.html" --region "$REGION" --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" --query "Invalidation.Id" --output text
echo "published to https://$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --query "Stacks[0].Parameters[?ParameterKey=='DomainName'].ParameterValue" --output text)"
