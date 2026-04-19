#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/tmp/v1.53-poc-4k-capture}"
MANIFEST_PATH="$ROOT_DIR/scripts/poc-4k-capture/Cargo.toml"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cargo run --manifest-path "$MANIFEST_PATH" --release -- "$OUT_DIR"
