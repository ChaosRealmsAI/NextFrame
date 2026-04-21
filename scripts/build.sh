#!/usr/bin/env bash
# build.sh — NextFrame release build (v0.1.1 scaffold only).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> cargo build --release --workspace"
cargo build --release --workspace

echo ""
echo "[ok] release artifacts in target/release/"
ls -la target/release/nf 2>/dev/null || true
