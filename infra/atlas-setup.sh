#!/usr/bin/env bash
# Creates (idempotently) the Atlas M0 cluster, the app database user, and the IP access entry for
# project "callcoach", then writes MONGODB_URI to ~/.config/callcoach/prod.env (mode 600).
# Reads MONGODB_PUBLIC_KEY / MONGODB_PRIVATE_KEY from the repo's untracked .env. Prints no secrets.
set -euo pipefail
cd "$(dirname "$0")/.."

envval() { awk -F= -v k="$1" '$1==k {sub(/^[^=]*=/,""); print}' .env; }
PUB="$(envval MONGODB_PUBLIC_KEY)"; PRIV="$(envval MONGODB_PRIVATE_KEY)"
[ -n "$PUB" ] && [ -n "$PRIV" ] || { echo "MONGODB_PUBLIC_KEY / MONGODB_PRIVATE_KEY missing from .env" >&2; exit 1; }

BASE="https://cloud.mongodb.com/api/atlas/v2"
CLUSTER="${ATLAS_CLUSTER:-callcoach}"
REGION="${ATLAS_REGION:-US_EAST_1}"      # M0 is offered in a limited set of AWS regions
DB_USER="${ATLAS_DB_USER:-callcoach_app}"
DB_NAME="stewardship"
OUT_DIR="$HOME/.config/callcoach"; OUT="$OUT_DIR/prod.env"

api() { # method path [json] [version]
  local method="$1" path="$2" body="${3:-}" ver="${4:-2023-01-01}"
  curl -sS --digest -u "$PUB:$PRIV" -X "$method" -H "Accept: application/vnd.atlas.$ver+json" -H "Content-Type: application/json" \
    ${body:+--data "$body"} -w '\n%{http_code}' "$BASE$path"
}
split() { CODE="${1##*$'\n'}"; BODY="${1%$'\n'*}"; }

split "$(api GET /groups)"; [ "$CODE" = 200 ] || { echo "Atlas auth failed (HTTP $CODE): $(echo "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("detail",""))' 2>/dev/null)" >&2; exit 1; }
GID="$(echo "$BODY" | python3 -c 'import sys,json;print(next(g["id"] for g in json.load(sys.stdin)["results"] if g["name"]=="callcoach"))')"
echo "project callcoach: $GID"

# --- cluster (M0, AWS) ---
split "$(api GET "/groups/$GID/clusters/$CLUSTER" "" 2023-02-01)"
if [ "$CODE" = 404 ]; then
  split "$(api POST "/groups/$GID/clusters" "{\"name\":\"$CLUSTER\",\"clusterType\":\"REPLICASET\",\"replicationSpecs\":[{\"regionConfigs\":[{\"providerName\":\"TENANT\",\"backingProviderName\":\"AWS\",\"regionName\":\"$REGION\",\"priority\":7,\"electableSpecs\":{\"instanceSize\":\"M0\"}}]}]}" 2023-02-01)"
  [ "$CODE" = 201 ] || { echo "cluster create failed (HTTP $CODE): $BODY" | head -c 600 >&2; exit 1; }
  echo "cluster $CLUSTER: creating ($REGION)"
else
  echo "cluster $CLUSTER: exists"
fi

# --- IP access (Lambda has no fixed egress IP; see docs/deploy.md) ---
split "$(api POST "/groups/$GID/accessList" '[{"cidrBlock":"0.0.0.0/0","comment":"Lambda has no fixed IP (callcoach prod)"}]')"
echo "access list: HTTP $CODE (200/201 ok, 409 already present)"

# --- database user ---
PASS="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"
USER_BODY="{\"databaseName\":\"admin\",\"username\":\"$DB_USER\",\"password\":\"$PASS\",\"roles\":[{\"databaseName\":\"$DB_NAME\",\"roleName\":\"readWrite\"}]}"
split "$(api GET "/groups/$GID/databaseUsers/admin/$DB_USER")"
if [ "$CODE" = 200 ]; then split "$(api PATCH "/groups/$GID/databaseUsers/admin/$DB_USER" "{\"password\":\"$PASS\"}")"; echo "db user: password rotated (HTTP $CODE)"
else split "$(api POST "/groups/$GID/databaseUsers" "$USER_BODY")"; echo "db user: created (HTTP $CODE)"; fi
[ "$CODE" = 200 ] || [ "$CODE" = 201 ] || { echo "db user failed: $BODY" | head -c 400 >&2; exit 1; }

# --- wait for the cluster, then write the connection string ---
for i in $(seq 1 60); do
  split "$(api GET "/groups/$GID/clusters/$CLUSTER" "" 2023-02-01)"
  STATE="$(echo "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("stateName",""))')"
  [ "$STATE" = IDLE ] && break
  echo "cluster state: $STATE ($i/60)"; sleep 10
done
[ "$STATE" = IDLE ] || { echo "cluster not ready; rerun this script later" >&2; exit 1; }
SRV="$(echo "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin)["connectionStrings"]["standardSrv"])')"
HOST="${SRV#mongodb+srv://}"
mkdir -p "$OUT_DIR"; chmod 700 "$OUT_DIR"
umask 077
printf 'MONGODB_URI=mongodb+srv://%s:%s@%s/%s?retryWrites=true&w=majority\n' "$DB_USER" "$PASS" "$HOST" "$DB_NAME" > "$OUT"
echo "wrote $OUT (host $HOST, user $DB_USER, db $DB_NAME). Password not printed."
