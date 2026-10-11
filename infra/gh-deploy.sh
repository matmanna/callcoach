#!/usr/bin/env bash
# Record a deploy in GitHub: a Deployment (shows in the repo's "Deployments" section)
# plus a commit status (shows on PRs as "deploy/<env>"). Uses the gh CLI's auth, so no
# GitHub Actions or AWS OIDC is needed; runs wherever deploy-web.sh runs.
#
# Usage:
#   infra/gh-deploy.sh start  <env> <url>             # prints the deployment id
#   infra/gh-deploy.sh finish <env> <url> <id> [success|failure]
#
# Silently does nothing when gh is missing or not authenticated, so deploys never fail
# because of GitHub bookkeeping.
set -euo pipefail
cd "$(dirname "$0")/.."

cmd="${1:?start|finish}"; env_name="${2:?environment}"; url="${3:?url}"
sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"

if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  echo "gh not available/authenticated; skipping GitHub deploy status" >&2
  [ "$cmd" = start ] && echo ""
  exit 0
fi

case "$cmd" in
  start)
    id=$(gh api repos/:owner/:repo/deployments --input - --jq .id <<JSON
{"ref":"$sha","environment":"$env_name","auto_merge":false,"required_contexts":[],"description":"infra/deploy-web.sh"}
JSON
)
    gh api "repos/:owner/:repo/statuses/$sha" --input - >/dev/null <<JSON
{"state":"pending","context":"deploy/$env_name","target_url":"$url","description":"deploying to $env_name"}
JSON
    echo "$id"
    ;;
  finish)
    id="${4:?deployment id}"; state="${5:-success}"
    desc=$([ "$state" = success ] && echo "live" || echo "deploy failed")
    [ -n "$id" ] && gh api "repos/:owner/:repo/deployments/$id/statuses" --input - >/dev/null <<JSON
{"state":"$state","environment_url":"$url","description":"$desc","auto_inactive":true}
JSON
    gh api "repos/:owner/:repo/statuses/$sha" --input - >/dev/null <<JSON
{"state":"$state","context":"deploy/$env_name","target_url":"$url","description":"$desc"}
JSON
    ;;
esac
