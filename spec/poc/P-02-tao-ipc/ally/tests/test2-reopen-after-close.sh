#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../src" && pwd)"
LOG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/test2-reopen-after-close.log"
SOCK="/tmp/nf-test-p02-test2-$$.sock"
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

./target/debug/ipc-client --socket "$SOCK" --req-id 1 --op close-window --window-id w-1 >> "$LOG"
./target/debug/ipc-client --socket "$SOCK" --req-id 2 --op close-window --window-id w-2 >> "$LOG"
sleep 0.1
kill -0 "$PID"
echo "process_survived_last_window=yes" >> "$LOG"

START_NS="$(date +%s%N)"
OPEN="$(./target/debug/ipc-client --socket "$SOCK" --req-id 3 --op open-window)"
END_NS="$(date +%s%N)"
ELAPSED_MS=$(( (END_NS - START_NS) / 1000000 ))
echo "open_after_last_close=${OPEN}" >> "$LOG"
echo "elapsed_ms=${ELAPSED_MS}" >> "$LOG"
echo "$OPEN" | grep '"opened":"w-3"' >/dev/null
test "$ELAPSED_MS" -lt 200
