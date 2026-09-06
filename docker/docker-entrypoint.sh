#!/bin/sh
set -e

sh /configure-proxy.sh

export PORT="${PORT:-3000}"

cleanup() {
  kill "${NODE_PID:-}" 2>/dev/null || true
  exit 0
}
trap cleanup TERM INT

node /app/apps/api/dist/apps/api/src/migrate.js
node /app/apps/api/dist/apps/api/src/main.js &
NODE_PID=$!

exec nginx -g "daemon off;"
