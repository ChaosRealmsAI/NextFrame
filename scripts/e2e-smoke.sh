#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

passed=0
failed=0

run_step() {
  local label="$1"
  shift

  if "$@" 1>&2; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    printf '{"passed":%d,"failed":%d,"failed_step":"%s"}\n' "$passed" "$failed" "$label"
    exit 1
  fi
}

bundle_path="/tmp/nfe2e.html"
record_path="/tmp/nfe2e.mp4"

run_step "cargo build --release -p nf-cli" cargo build --release -p nf-cli
run_step "npm install" bash -lc 'cd src/nf-core-engine && npm install'
run_step "npm run build" bash -lc 'cd src/nf-core-engine && npm run build'
run_step "nf build" ./target/release/nf build spec/fixtures/sample.json -o "$bundle_path"
run_step "bundle markers" bash -lc "grep -q '__nfResolved' '$bundle_path' && grep -q 'window.__nfTracks' '$bundle_path'"
run_step "nf validate" bash -lc "./target/release/nf validate spec/fixtures/sample.json | jq -e '.ok'"
run_step "nf record dry-run" bash -lc "./target/release/nf record --bundle '$bundle_path' --out '$record_path' --duration 0.5 --dry-run | jq -e '.mode == \"dry-run\"'"
run_step "lint-all" bash -lc "bash scripts/lint-all.sh | jq -e '.failures == []'"

if [ "${NF_E2E_ACTUAL_RECORD:-0}" = "1" ]; then
  run_step "optional actual record" bash -lc "./target/release/nf record --bundle '$bundle_path' --out '$record_path' --duration 0.5 --verify-pixels | jq -e '.ok'"
  run_step "optional ffprobe" ffprobe -v error -show_entries stream=codec_name,width,height -of json "$record_path"
fi

printf '{"passed":%d,"failed":%d}\n' "$passed" "$failed"
