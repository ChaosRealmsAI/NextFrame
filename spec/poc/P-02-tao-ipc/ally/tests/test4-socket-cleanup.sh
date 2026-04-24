#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../src" && pwd)"
LOG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/test4-socket-cleanup.log"
SOCK="/tmp/nf-test-p02-test4-$$.sock"
SERVER_LOG="${LOG%.log}.server.log"

: > "$LOG"
: > "$SERVER_LOG"
cd "$ROOT"
cargo build --quiet >> "$LOG" 2>&1

./target/debug/poc-tao-ipc --socket "$SOCK" >> "$SERVER_LOG" 2>&1 &
PID=$!

for _ in {1..50}; do
  [[ -S "$SOCK" ]] && break
  sleep 0.1
done

ls -la "$SOCK" >> "$LOG"
kill -TERM "$PID"
wait "$PID" || true
sleep 0.2
test ! -e "$SOCK"
echo "socket_removed_after_sigterm=yes" >> "$LOG"

./target/debug/poc-tao-ipc --socket "$SOCK" >> "$SERVER_LOG" 2>&1 &
PID2=$!
cleanup() {
  kill -TERM "$PID2" >/dev/null 2>&1 || true
  wait "$PID2" >/dev/null 2>&1 || true
  rm -f "$SOCK"
}
trap cleanup EXIT

for _ in {1..50}; do
  [[ -S "$SOCK" ]] && break
  sleep 0.1
done

./target/debug/ipc-client --socket "$SOCK" --req-id 2 --op status >> "$LOG"
echo "restart_bind_ok=yes" >> "$LOG"
