#!/usr/bin/env bash
# Clean up a sandbox created by prepare-blind-sandbox.sh or blind-test-sonnet.sh.
# Usage: ./scripts/cleanup-blind-sandbox.sh <sandbox-dir>

set -u
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="${1:-}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

fail() {
  log "cleanup failed: $*"
  exit 1
}

[ -n "$SANDBOX" ] || fail "sandbox path is required"
[ "$SANDBOX" != "/" ] || fail "refusing to remove /"
[ "$SANDBOX" != "$ROOT" ] || fail "refusing to remove repository root"

case "$SANDBOX" in
  "$ROOT"/tmp/sonnet-sandbox-*|tmp/sonnet-sandbox-*)
    ;;
  *)
    if [ "${NEXTFRAME_BLIND_CLEAN_ANY:-0}" != "1" ]; then
      fail "refusing to remove non-harness path: $SANDBOX"
    fi
    ;;
esac

PID=""
if [ -f "$SANDBOX/nf-shell.pid" ]; then
  PID="$(sed -n '1p' "$SANDBOX/nf-shell.pid" | tr -cd '0-9')"
fi

if [ -n "$PID" ] && kill -0 "$PID" >/dev/null 2>&1; then
  log "stopping nf-shell pid=$PID"
  kill "$PID" >/dev/null 2>&1 || true
  elapsed=0
  while kill -0 "$PID" >/dev/null 2>&1 && [ "$elapsed" -lt 10 ]; do
    sleep 1
    elapsed=$((elapsed + 1))
  done
  if kill -0 "$PID" >/dev/null 2>&1; then
    log "nf-shell still alive; sending SIGKILL pid=$PID"
    kill -9 "$PID" >/dev/null 2>&1 || true
  fi
fi

if [ -f "$SANDBOX/nf-shell.sock" ]; then
  SOCKET="$(sed -n '1p' "$SANDBOX/nf-shell.sock")"
  if [ -n "$SOCKET" ] && [ -e "$SOCKET" ]; then
    log "removing IPC socket: $SOCKET"
    rm -f "$SOCKET" || true
  fi
fi

if [ -d "$SANDBOX" ]; then
  log "removing sandbox: $SANDBOX"
  rm -rf "$SANDBOX"
fi
