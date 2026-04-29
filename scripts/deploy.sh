#!/usr/bin/env bash
# Pull latest code, rebuild changed images, roll containers, smoke-test.
# Run on the VPS:  ./scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "✗ .env missing — copy .env.production.example → .env and fill it in"
  exit 1
fi

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
COMPOSE="docker compose -f compose.prod.yml"

echo "→ pulling latest"
git pull --ff-only

echo "→ building (BuildKit cache + layered pnpm store)"
$COMPOSE build --pull

echo "→ rolling containers"
$COMPOSE up -d --remove-orphans

echo "→ pruning dangling images"
docker image prune -f >/dev/null

echo "→ verifying"
./scripts/verify.sh
