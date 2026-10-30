#!/usr/bin/env bash
# Daily automatic-award run: asks the site to evaluate service days, good
# conduct and the rest. Run by ravenfall-awards.timer; run by hand with:
#   sudo -u ravenfall bash /opt/ravenfall/ravenfall/deploy/awards.sh
# Same internal token as the gateway (an HMAC of NEXTAUTH_SECRET), read from .env.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/ravenfall/ravenfall/.env}"
get() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -n1 | tr -d "\"'"; }

SECRET="${NEXTAUTH_SECRET:-$(get NEXTAUTH_SECRET)}"
PORT="${SITE_PORT:-$(get SITE_PORT)}"
SITE="${SITE_INTERNAL_URL:-http://127.0.0.1:${PORT:-8002}}"
if [[ -z "$SECRET" ]]; then
    echo "NEXTAUTH_SECRET is not set; the site would refuse the call." >&2
    exit 1
fi

TOKEN=$(printf %s ravenfall-gateway | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)
curl -fsS --max-time 120 -X POST -H "x-internal-token: $TOKEN" "${SITE%/}/api/internal/awards"
echo
