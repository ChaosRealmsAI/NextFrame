#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../src" && pwd)"
LOG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/test3-concurrent-ipc.log"
SOCK="/tmp/nf-test-p02-test3-$$.sock"
SERVER_LOG="${LOG%.log}.server.log"
RESP_DIR="$(mktemp -d)"

: > "$LOG"
: > "$SERVER_LOG"
cd "$ROOT"
cargo build --quiet >> "$LOG" 2>&1

./target/debug/poc-tao-ipc --socket "$SOCK" >> "$SERVER_LOG" 2>&1 &
PID=$!
cleanup() {
  kill -TERM "$PID" >/dev/null 2>&1 || true
  wait "$PID" >/dev/null 2>&1 || true
  rm -f "$SOCK"
  rm -rf "$RESP_DIR"
}
trap cleanup EXIT

for _ in {1..50}; do
  [[ -S "$SOCK" ]] && break
  sleep 0.1
done

CLIENT_PIDS=()
for i in {1..10}; do
  ./target/debug/ipc-client --socket "$SOCK" --req-id "$i" --op status > "$RESP_DIR/$i.json" &
  CLIENT_PIDS+=("$!")
done
for client_pid in "${CLIENT_PIDS[@]}"; do
  wait "$client_pid"
done

cat "$RESP_DIR"/*.json | sort >> "$LOG"

for i in {1..10}; do
  grep "\"req_id\":$i" "$RESP_DIR/$i.json" >/dev/null
  grep '"ok":true' "$RESP_DIR/$i.json" >/dev/null
done

COUNT="$(cat "$RESP_DIR"/*.json | wc -l | tr -d ' ')"
test "$COUNT" = "10"
echo "concurrent_demux_ok=10" >> "$LOG"
