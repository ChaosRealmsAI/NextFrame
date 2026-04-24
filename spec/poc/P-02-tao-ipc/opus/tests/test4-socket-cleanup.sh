#!/usr/bin/env bash
# test4: socket cleanup on SIGTERM + restart
# - start server
# - assert sock exists
# - kill -TERM
# - wait
# - assert sock removed
# - restart server · should bind successfully (no "Address already in use")

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
BIN_MAIN="$SRC/target/debug/poc-tao-ipc"
LOG="$ROOT/tests/test4.log"
SOCK="/tmp/nf-test-$(id -u).sock"

: > "$LOG"
echo "[test4] start" | tee -a "$LOG"

# clean
rm -f "$SOCK" || true
pkill -f "target/debug/poc-tao-ipc" 2>/dev/null || true
sleep 0.2

# Start server (headless)
"$BIN_MAIN" --headless >"$ROOT/tests/test4.server1.log" 2>&1 &
PID1=$!
echo "[test4] server1 pid=$PID1" | tee -a "$LOG"

# Wait for ready
for i in {1..30}; do
  [[ -S "$SOCK" ]] && break
  sleep 0.1
done
if [[ ! -S "$SOCK" ]]; then
  echo "[test4] FAIL sock not ready" | tee -a "$LOG"
  kill "$PID1" 2>/dev/null || true
  exit 1
fi
echo "[test4] sock exists after boot: $(ls -la $SOCK)" | tee -a "$LOG"

# SIGTERM
echo "[test4] kill -TERM $PID1" | tee -a "$LOG"
kill -TERM "$PID1"
# Wait up to 2s for exit
for i in {1..20}; do
  if ! kill -0 "$PID1" 2>/dev/null; then
    echo "[test4] server1 exited after ${i}00ms" | tee -a "$LOG"
    break
  fi
  sleep 0.1
done

# Check socket removed
if [[ -S "$SOCK" ]]; then
  echo "[test4] FAIL socket still exists after SIGTERM: $(ls -la $SOCK)" | tee -a "$LOG"
  rm -f "$SOCK" || true
  exit 1
fi
echo "[test4] socket cleaned OK" | tee -a "$LOG"

# Restart server — should bind without "Address already in use"
"$BIN_MAIN" --headless >"$ROOT/tests/test4.server2.log" 2>&1 &
PID2=$!
echo "[test4] server2 pid=$PID2" | tee -a "$LOG"
for i in {1..30}; do
  [[ -S "$SOCK" ]] && break
  sleep 0.1
done
if [[ ! -S "$SOCK" ]]; then
  echo "[test4] FAIL restart sock not ready" | tee -a "$LOG"
  cat "$ROOT/tests/test4.server2.log" | tee -a "$LOG"
  kill "$PID2" 2>/dev/null || true
  exit 1
fi

# Also test SIGINT (ctrl-c path)
kill -INT "$PID2"
for i in {1..20}; do
  if ! kill -0 "$PID2" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ -S "$SOCK" ]]; then
  echo "[test4] FAIL socket still exists after SIGINT" | tee -a "$LOG"
  rm -f "$SOCK" || true
  exit 1
fi
echo "[test4] SIGINT path also clean" | tee -a "$LOG"

echo "[test4] PASS" | tee -a "$LOG"
exit 0
