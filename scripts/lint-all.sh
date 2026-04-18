#!/usr/bin/env bash
# lint-all.sh — run all 6 workspace lint gates in order.
# stdout: JSON lines per step + final {"event":"lint-all.done",...} line.
# exit 1 if any gate fails.
set -euo pipefail

cd "$(dirname "$0")/.."

passed=0
failed=0
skipped=0
failed_gates=()

run_gate() {
  local name="$1"
  shift
  # Emit start marker to stderr (stdout stays JSON-only).
  printf '[lint-all] %s ...\n' "$name" >&2
  if "$@" 1>&2; then
    passed=$((passed + 1))
    printf '{"event":"lint-all.gate","name":"%s","status":"pass"}\n' "$name"
  else
    failed=$((failed + 1))
    failed_gates+=("$name")
    printf '{"event":"lint-all.gate","name":"%s","status":"fail"}\n' "$name"
  fi
}

skip_gate() {
  local name="$1"
  local reason="$2"
  skipped=$((skipped + 1))
  printf '{"event":"lint-all.gate","name":"%s","status":"skip","reason":"%s"}\n' \
    "$name" "$reason"
}

# --- Gate 1: clippy -----------------------------------------------------------
# Workspace has at least one crate (nf-cli) → always runnable.
run_gate "cargo-clippy" cargo clippy --workspace --all-targets -- -D warnings

# --- Gate 2: architecture test ------------------------------------------------
run_gate "cargo-arch-test" cargo test --workspace --test architecture

# --- Gate 3: file-size lint ---------------------------------------------------
run_gate "lint-file-size" bash scripts/lint-file-size.sh

# --- Gate 4: ban-frameworks lint ----------------------------------------------
run_gate "lint-ban-frameworks" bash scripts/lint-ban-frameworks.sh

# --- Gate 5: track ABI lint ---------------------------------------------------
# Skip gracefully when T4-TRACKS hasn't populated yet (baseline condition).
if [ -f src/nf-tracks/scripts/check-abi.mjs ]; then
  shopt -s nullglob
  track_files=(src/nf-tracks/official/*.js)
  shopt -u nullglob
  if [ "${#track_files[@]}" -eq 0 ]; then
    skip_gate "track-abi-lint" "no official tracks yet"
  else
    run_gate "track-abi-lint" node src/nf-tracks/scripts/check-abi.mjs "${track_files[@]}"
  fi
else
  skip_gate "track-abi-lint" "check-abi.mjs not built yet"
fi

# --- Gate 6: CLI stdout JSON --------------------------------------------------
# Build release + run `nf validate --help` and assert stdout parses as JSON
# via jq. During T4-HARNESS baseline, the stub prints {"event":"cli.stub"};
# after T4-CLI lands, the real --help output must also be JSON.
if ! command -v jq >/dev/null 2>&1; then
  skip_gate "cli-json" "jq not installed"
else
  cli_json_gate() {
    cargo build --release --package nf-cli 1>&2 || return 1
    # Stub ignores args; real CLI must too.
    ./target/release/nf validate --help 2>/dev/null | jq empty
  }
  run_gate "cli-json" cli_json_gate
fi

# --- Final summary ------------------------------------------------------------
total=$((passed + failed + skipped))
if [ "$failed" -eq 0 ]; then
  printf '{"event":"lint-all.done","gates":%s,"passed":%s,"skipped":%s,"failed":0}\n' \
    "$total" "$passed" "$skipped"
  exit 0
else
  # Build failed_gates JSON array manually (avoids jq dep here).
  arr="["
  for i in "${!failed_gates[@]}"; do
    [ "$i" -gt 0 ] && arr="$arr,"
    arr="$arr\"${failed_gates[$i]}\""
  done
  arr="$arr]"
  printf '{"event":"lint-all.done","gates":%s,"passed":%s,"skipped":%s,"failed":%s,"failed_gates":%s}\n' \
    "$total" "$passed" "$skipped" "$failed" "$arr"
  exit 1
fi
