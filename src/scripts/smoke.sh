#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/../.."

cargo build --release -p shell >/tmp/nextframe-shell-smoke-build.log 2>&1
cargo run --release -p shell >/tmp/nextframe-shell-smoke.log 2>&1 &
cargo_pid=$!
shell_alive=0

cleanup() {
  pkill shell >/dev/null 2>&1 || true

  if kill -0 "$cargo_pid" >/dev/null 2>&1; then
    kill "$cargo_pid" >/dev/null 2>&1 || true
    wait "$cargo_pid" || true
  fi
}

trap cleanup EXIT

sleep 3

if pgrep -x shell >/dev/null 2>&1; then
  shell_alive=1
fi

pkill shell >/dev/null 2>&1 || true

if kill -0 "$cargo_pid" >/dev/null 2>&1; then
  if [ "$shell_alive" -eq 0 ]; then
    kill "$cargo_pid" >/dev/null 2>&1 || true
  fi
  wait "$cargo_pid" || true
fi

trap - EXIT

if [ "$shell_alive" -eq 1 ]; then
  exit 0
fi

echo "shell did not stay alive for at least 2 seconds" >&2
exit 1
