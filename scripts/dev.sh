#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd "$ROOT/backend" && npm run migrate >/dev/null)
(cd "$ROOT/backend" && npm run dev) &
BACKEND_PID=$!
(cd "$ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Duka is starting:"
echo "  API      http://localhost:4000/api/v1 (PostgreSQL 127.0.0.1:5432)"
echo "  Frontend http://localhost:3000"
echo ""
wait
