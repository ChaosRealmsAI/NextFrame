#!/usr/bin/env bash
# test1: 2 windows coexist · close w-1 · w-2 + process still alive
#
# Runs tao EventLoop in background · IPC drives window lifecycle.
# On macOS: tao opens real windows. Headless CI would need Xvfb (Linux) or
# `osascript` to hide. For a local POC we tolerate windows actually appearing.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
BIN_MAIN="$SRC/target/debug/poc-tao-ipc"
BIN_CLIENT="$SRC/target/debug/ipc-client"
LOG="$ROOT/tests/test1.log"
SOCK="/tmp/nf-test-$(id -u).sock"

: > "$LOG"
echo "[test1] start" | tee -a "$LOG"

# clean
rm -f "$SOCK" || true
pkill -f "target/debug/poc-tao-ipc" 2>/dev/null || true
sleep 0.3

# Start server with 2 initial windows (tao EventLoop).
"$BIN_MAIN" --initial-windows 2 >"$ROOT/tests/test1.server.log" 2>&1 &
PID=$!
echo "[test1] server pid=$PID" | tee -a "$LOG"

# Wait for ready
for i in {1..60}; do
  [[ -S "$SOCK" ]] && break
  sleep 0.1
done
if [[ ! -S "$SOCK" ]]; then
  echo "[test1] FAIL sock not ready" | tee -a "$LOG"
  cat "$ROOT/tests/test1.server.log" | tee -a "$LOG"
  kill "$PID" 2>/dev/null || true
  exit 1
fi

# list-windows should have 2 (w-1, w-2)
"$BIN_CLIENT" --sock "$SOCK" --op list-windows --req_id 1 > "$ROOT/tests/test1.list1.json"
CNT=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['data']))" "$ROOT/tests/test1.list1.json")
echo "[test1] initial window count = $CNT (expect 2)" | tee -a "$LOG"
[[ "$CNT" == "2" ]] || { echo "[test1] FAIL initial != 2" | tee -a "$LOG"; kill "$PID" 2>/dev/null; exit 1; }

# close w-1
"$BIN_CLIENT" --sock "$SOCK" --op close-window --req_id 2 --id "w-1" > "$ROOT/tests/test1.close1.json"
CLOSE_OK=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['ok'])" "$ROOT/tests/test1.close1.json")
echo "[test1] close w-1 ok=$CLOSE_OK" | tee -a "$LOG"
[[ "$CLOSE_OK" == "True" ]] || { echo "[test1] FAIL close w-1" | tee -a "$LOG"; kill "$PID" 2>/dev/null; exit 1; }

sleep 0.2

# Process still alive? w-2 still there?
if ! kill -0 "$PID" 2>/dev/null; then
  echo "[test1] FAIL process died after closing w-1" | tee -a "$LOG"
  exit 1
fi

"$BIN_CLIENT" --sock "$SOCK" --op list-windows --req_id 3 > "$ROOT/tests/test1.list2.json"
CNT=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['data']))" "$ROOT/tests/test1.list2.json")
IDS=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['data'])" "$ROOT/tests/test1.list2.json")
echo "[test1] after close count = $CNT ids=$IDS (expect 1 w-2)" | tee -a "$LOG"
[[ "$CNT" == "1" ]] || { echo "[test1] FAIL after close count != 1" | tee -a "$LOG"; kill "$PID" 2>/dev/null; exit 1; }

# Clean shutdown
"$BIN_CLIENT" --sock "$SOCK" --op quit --req_id 99 >/dev/null 2>&1 || true
sleep 0.3
kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true

echo "[test1] PASS" | tee -a "$LOG"
exit 0
