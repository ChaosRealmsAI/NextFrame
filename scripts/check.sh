#!/usr/bin/env bash
# check.sh — NextFrame scaffold verification (v0.1.1).
# Runs cargo check + clippy + tsc --noEmit. Exits non-zero on any failure.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> cargo check --workspace"
cargo check --workspace --all-targets

echo "==> cargo clippy --workspace -- -D warnings"
cargo clippy --workspace --all-targets -- -D warnings

echo "==> tsc --noEmit (frontend/nf-components)"
cd frontend/nf-components
if [ ! -d node_modules ]; then
  echo "    node_modules missing · running npm install"
  npm install --silent
fi
npx --no-install tsc --noEmit

echo ""
echo "[ok] all checks green"
