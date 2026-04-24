#!/usr/bin/env bash
# test3: 10 concurrent IPC requests (req_id 1..10) · all return · no dropped · req_id aligned
#
# uses headless mode to focus on socket/IPC concurrency (not coupled with GUI event loop).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
BIN_MAIN="$SRC/target/debug/poc-tao-ipc"
BIN_CLIENT="$SRC/target/debug/ipc-client"
LOG="$ROOT/tests/test3.log"
SOCK="/tmp/nf-test-$(id -u).sock"

: > "$LOG"
echo "[test3] start  sock=$SOCK" | tee -a "$LOG"

# clean
rm -f "$SOCK" || true
pkill -f "target/debug/poc-tao-ipc" 2>/dev/null || true
sleep 0.2

# Start server (headless so we don't need a display)
"$BIN_MAIN" --headless >"$ROOT/tests/test3.server.log" 2>&1 &
SERVER_PID=$!
echo "[test3] server pid=$SERVER_PID" | tee -a "$LOG"

# Wait for ready
for i in {1..30}; do
  if [[ -S "$SOCK" ]]; then
    echo "[test3] sock ready after ${i}00ms" | tee -a "$LOG"
    break
  fi
  sleep 0.1
done
if [[ ! -S "$SOCK" ]]; then
  echo "[test3] FAIL sock not ready" | tee -a "$LOG"
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

# Fire 10 concurrent requests with distinct req_ids
mkdir -p "$ROOT/tests/test3-responses"
rm -f "$ROOT/tests/test3-responses/"*.json 2>/dev/null || true

echo "[test3] firing 10 concurrent req_id=1..10 (ping)" | tee -a "$LOG"
PIDS=()
START_NS=$(python3 -c 'import time; print(int(time.time()*1e9))')
for i in 1 2 3 4 5 6 7 8 9 10; do
  ( "$BIN_CLIENT" --sock "$SOCK" --op ping --req_id "$i" > "$ROOT/tests/test3-responses/resp-$i.json" 2>&1 ) &
  PIDS+=($!)
done
for p in "${PIDS[@]}"; do wait "$p"; done
END_NS=$(python3 -c 'import time; print(int(time.time()*1e9))')
DUR_MS=$(( (END_NS - START_NS) / 1000000 ))
echo "[test3] all 10 returned in ${DUR_MS}ms" | tee -a "$LOG"

# Verify each resp has matching req_id + ok:true
OK=1
for i in 1 2 3 4 5 6 7 8 9 10; do
  f="$ROOT/tests/test3-responses/resp-$i.json"
  if [[ ! -s "$f" ]]; then
    echo "[test3] FAIL resp-$i missing/empty" | tee -a "$LOG"
    OK=0
    continue
  fi
  RID=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['req_id'])" "$f" 2>/dev/null || echo "parse_err")
  OKFLAG=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['ok'])" "$f" 2>/dev/null || echo "parse_err")
  DATA=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('data',''))" "$f" 2>/dev/null || echo "")
  echo "[test3] resp-$i: req_id=$RID ok=$OKFLAG data=$DATA" | tee -a "$LOG"
  if [[ "$RID" != "$i" || "$OKFLAG" != "True" ]]; then
    echo "[test3] FAIL mismatch at $i" | tee -a "$LOG"
    OK=0
  fi
done

# Now 10 concurrent open-window with distinct IDs
echo "[test3] firing 10 concurrent open-window req_id=11..20" | tee -a "$LOG"
PIDS=()
for i in 11 12 13 14 15 16 17 18 19 20; do
  ( "$BIN_CLIENT" --sock "$SOCK" --op open-window --req_id "$i" --id "w-$i" > "$ROOT/tests/test3-responses/resp-$i.json" 2>&1 ) &
  PIDS+=($!)
done
for p in "${PIDS[@]}"; do wait "$p"; done

for i in 11 12 13 14 15 16 17 18 19 20; do
  f="$ROOT/tests/test3-responses/resp-$i.json"
  if [[ ! -s "$f" ]]; then
    echo "[test3] FAIL open resp-$i missing" | tee -a "$LOG"; OK=0; continue
  fi
  RID=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['req_id'])" "$f" 2>/dev/null)
  OKFLAG=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['ok'])" "$f" 2>/dev/null)
  CREATED=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['data']['created'])" "$f" 2>/dev/null)
  echo "[test3] resp-$i: req_id=$RID ok=$OKFLAG created=$CREATED" | tee -a "$LOG"
  if [[ "$RID" != "$i" || "$OKFLAG" != "True" || "$CREATED" != "w-$i" ]]; then
    echo "[test3] FAIL open mismatch at $i" | tee -a "$LOG"; OK=0
  fi
done

# list-windows should return all 10
LIST_RESP="$ROOT/tests/test3-responses/list.json"
"$BIN_CLIENT" --sock "$SOCK" --op list-windows --req_id 99 > "$LIST_RESP"
COUNT=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['data']))" "$LIST_RESP")
echo "[test3] list-windows count=$COUNT" | tee -a "$LOG"
[[ "$COUNT" == "10" ]] || { echo "[test3] FAIL list count != 10" | tee -a "$LOG"; OK=0; }

# cleanup server via quit
"$BIN_CLIENT" --sock "$SOCK" --op quit --req_id 100 >/dev/null 2>&1 || true
sleep 0.3
if kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true
fi
wait "$SERVER_PID" 2>/dev/null || true

if [[ "$OK" == "1" ]]; then
  echo "[test3] PASS" | tee -a "$LOG"
  exit 0
else
  echo "[test3] FAIL" | tee -a "$LOG"
  exit 1
fi
