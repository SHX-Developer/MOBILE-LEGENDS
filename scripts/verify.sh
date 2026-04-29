#!/usr/bin/env bash
# Smoke-test the deployed stack. Exits non-zero on any failure.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

DOMAIN="${DOMAIN:-localhost}"
SCHEME="https"
[[ "$DOMAIN" == "localhost" || "$DOMAIN" == 127.* ]] && SCHEME="http"
URL="$SCHEME://$DOMAIN"

retry() {
  local what="$1" url="$2" tries="${3:-30}"
  for ((i=1; i<=tries; i++)); do
    if curl -fsSk --max-time 5 "$url" >/dev/null 2>&1; then
      printf "  ✓ %-12s %s\n" "$what" "$url"
      return 0
    fi
    sleep 2
  done
  printf "  ✗ %-12s %s (timeout after %ds)\n" "$what" "$url" "$((tries * 2))"
  return 1
}

echo "→ smoke test against $URL"
fail=0
retry "api"     "$URL/api/healthz"   || fail=1
retry "web"     "$URL/healthz"        || fail=1
retry "spa"     "$URL/"               || fail=1

echo
echo "→ container status:"
docker compose -f compose.prod.yml ps

if [[ $fail -ne 0 ]]; then
  echo
  echo "✗ verification failed — last 30 lines per service:"
  docker compose -f compose.prod.yml logs --tail=30
  exit 1
fi

echo
echo "✓ all healthy — open $URL in Telegram WebApp on your phone"
