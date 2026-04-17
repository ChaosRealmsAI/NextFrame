#!/bin/bash

set -u

cd "$(dirname "$0")/.."

passes=()
failures=()

run_step() {
  local name="$1"
  shift

  if "$@"; then
    passes[${#passes[@]}]="$name"
  else
    echo "[lint-all] ${name} failed" >&2
    failures[${#failures[@]}]="$name"
  fi
}

json_array() {
  local first=1
  local item
  printf '['
  for item in "$@"; do
    if [ $first -eq 0 ]; then
      printf ','
    fi
    first=0
    printf '"%s"' "$item"
  done
  printf ']'
}

run_step "cargo-clippy" cargo clippy --workspace -- -D warnings
run_step "cargo-test" cargo test --workspace
run_step "lint-file-size" bash scripts/lint-file-size.sh
run_step "lint-tracks" bash scripts/lint-tracks.sh
run_step "lint-cli-json" bash scripts/lint-cli-json.sh

set +u
printf '{"passes":'
json_array "${passes[@]}"
printf ',"failures":'
json_array "${failures[@]}"
printf '}\n'
set -u

if [ ${#failures[@]} -gt 0 ]; then
  exit 1
fi
