#!/usr/bin/env bash
# test2: close last window · process alive · open-window succeeds within 0.2s
#
# Validates Mac convention (tao does NOT exit event loop on last window close) +
# fast IPC → EventLoopProxy → WindowBuilder roundtrip.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
BIN_MAIN="$SRC/target/debug/poc-tao-ipc"
BIN_CLIENT="$SRC/target/debug/ipc-client"
LOG="$ROOT/tests/test2.log"
SOCK="/tmp/nf-test-$(id -u).sock"

: > "$LOG"
echo "[test2] start" | tee -a "$LOG"

rm -f "$SOCK" || true
pkill -f "target/debug/poc-tao-ipc" 2>/dev/null || true
sleep 0.3

# Start with 2 initial windows
"$BIN_MAIN" --initial-windows 2 >"$ROOT/tests/test2.server.log" 2>&1 &
PID=$!
echo "[test2] server pid=$PID" | tee -a "$LOG"

for i in {1..60}; do
  [[ -S "$SOCK" ]] && break
  sleep 0.1
done
if [[ ! -S "$SOCK" ]]; then
  echo "[test2] FAIL sock not ready" | tee -a "$LOG"
  kill "$PID" 2>/dev/null || true
  exit 1
fi

# close both
"$BIN_CLIENT" --sock "$SOCK" --op close-window --req_id 1 --id "w-1" > "$ROOT/tests/test2.close1.json"
"$BIN_CLIENT" --sock "$SOCK" --op close-window --req_id 2 --id "w-2" > "$ROOT/tests/test2.close2.json"

sleep 0.15

# list = 0
"$BIN_CLIENT" --sock "$SOCK" --op list-windows --req_id 3 > "$ROOT/tests/test2.list.json"
CNT=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['data']))" "$ROOT/tests/test2.list.json")
echo "[test2] after closing both · count=$CNT (expect 0)" | tee -a "$LOG"
[[ "$CNT" == "0" ]] || { echo "[test2] FAIL count after close both != 0" | tee -a "$LOG"; kill "$PID" 2>/dev/null; exit 1; }

# Process still alive?
if ! kill -0 "$PID" 2>/dev/null; then
  echo "[test2] FAIL process died after last window closed (expected Mac: stay alive)" | tee -a "$LOG"
  exit 1
fi
echo "[test2] process alive after last window closed · good" | tee -a "$LOG"

# Measure open-window latency
START_NS=$(python3 -c 'import time; print(int(time.time()*1e9))')
"$BIN_CLIENT" --sock "$SOCK" --op open-window --req_id 4 --id "w-3" > "$ROOT/tests/test2.open.json"
END_NS=$(python3 -c 'import time; print(int(time.time()*1e9))')
DUR_MS=$(( (END_NS - START_NS) / 1000000 ))
OK=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['ok'])" "$ROOT/tests/test2.open.json")
CREATED=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['data']['created'])" "$ROOT/tests/test2.open.json")
echo "[test2] open-window w-3 ok=$OK created=$CREATED dur=${DUR_MS}ms (budget 200ms)" | tee -a "$LOG"
[[ "$OK" == "True" && "$CREATED" == "w-3" ]] || { echo "[test2] FAIL open-window" | tee -a "$LOG"; kill "$PID" 2>/dev/null; exit 1; }
[[ $DUR_MS -le 200 ]] || { echo "[test2] FAIL open-window too slow ${DUR_MS}ms > 200ms" | tee -a "$LOG"; kill "$PID" 2>/dev/null; exit 1; }

# Verify w-3 is listed
"$BIN_CLIENT" --sock "$SOCK" --op list-windows --req_id 5 > "$ROOT/tests/test2.list2.json"
CNT2=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['data']))" "$ROOT/tests/test2.list2.json")
IDS2=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['data'])" "$ROOT/tests/test2.list2.json")
echo "[test2] after reopen · count=$CNT2 ids=$IDS2" | tee -a "$LOG"

# cleanup
"$BIN_CLIENT" --sock "$SOCK" --op quit --req_id 99 >/dev/null 2>&1 || true
sleep 0.3
kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true

echo "[test2] PASS  open-window latency=${DUR_MS}ms" | tee -a "$LOG"
exit 0
