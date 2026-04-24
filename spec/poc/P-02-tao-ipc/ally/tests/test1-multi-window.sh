#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../src" && pwd)"
LOG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/test1-multi-window.log"
SOCK="/tmp/nf-test-p02-test1-$$.sock"
SERVER_LOG="${LOG%.log}.server.log"

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
}
trap cleanup EXIT

for _ in {1..50}; do
  [[ -S "$SOCK" ]] && break
  sleep 0.1
done

echo "pid=$PID socket=$SOCK" >> "$LOG"
STATUS="$(./target/debug/ipc-client --socket "$SOCK" --req-id 1 --op status)"
echo "initial=$STATUS" >> "$LOG"
echo "$STATUS" | grep '"window_count":2' >/dev/null

CLOSE="$(./target/debug/ipc-client --socket "$SOCK" --req-id 2 --op close-window --window-id w-1)"
echo "close_w1=$CLOSE" >> "$LOG"
echo "$CLOSE" | grep '"window_count":1' >/dev/null
echo "$CLOSE" | grep '"w-2"' >/dev/null

kill -0 "$PID"
echo "process_survived_close_1=yes" >> "$LOG"
