#!/usr/bin/env bash
# Prepare an isolated sandbox for the sonnet blind-test harness.
# Usage: ./scripts/prepare-blind-sandbox.sh [sandbox-dir]

set -u
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="${1:-$ROOT/tmp/sonnet-sandbox-manual-$(date +%s)}"
case "$SANDBOX" in
  /*) ;;
  *) SANDBOX="$ROOT/$SANDBOX" ;;
esac
READY_TIMEOUT="${NEXTFRAME_BLIND_SHELL_READY_TIMEOUT:-30}"
PREPARE_OK=0
SHELL_PID=""

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
}

socket_path() {
  uid="$(id -u)"
  case "$(uname -s)" in
    Darwin)
      printf '/tmp/nextframe-%s.sock\n' "$uid"
      ;;
    *)
      if [ -n "${XDG_RUNTIME_DIR:-}" ]; then
        printf '%s/nextframe-%s.sock\n' "$XDG_RUNTIME_DIR" "$uid"
      else
        printf '/tmp/nextframe-%s.sock\n' "$uid"
      fi
      ;;
  esac
}

socket_in_use() {
  path="$1"
  [ -e "$path" ] || return 1
  if command -v lsof >/dev/null 2>&1; then
    lsof "$path" >/dev/null 2>&1 && return 0
  fi
  return 1
}

fail() {
  log "prepare failed: $*"
  exit 1
}

cleanup_on_exit() {
  status=$?
  if [ "$status" != "0" ] && [ "$PREPARE_OK" != "1" ] && [ "${KEEP_BLIND_SANDBOX:-0}" != "1" ]; then
    if [ -n "$SHELL_PID" ] && kill -0 "$SHELL_PID" >/dev/null 2>&1; then
      kill "$SHELL_PID" >/dev/null 2>&1 || true
    fi
    case "$SANDBOX" in
      "$ROOT"/tmp/sonnet-sandbox-*|tmp/sonnet-sandbox-*)
        rm -rf "$SANDBOX"
        ;;
    esac
  fi
  exit "$status"
}

trap cleanup_on_exit EXIT INT TERM

NF_BIN="$ROOT/target/release/nf"
SHELL_BIN="$ROOT/target/release/nf-shell"

[ -x "$NF_BIN" ] || fail "missing release binary: $NF_BIN (run: make build)"
[ -x "$SHELL_BIN" ] || fail "missing release binary: $SHELL_BIN (run: make build)"

rm -rf "$SANDBOX"
mkdir -p "$SANDBOX/tmp" "$SANDBOX/home"

cp "$NF_BIN" "$SANDBOX/nf" || fail "copy nf failed"
cp "$SHELL_BIN" "$SANDBOX/nf-shell" || fail "copy nf-shell failed"
chmod +x "$SANDBOX/nf" "$SANDBOX/nf-shell"

SOCKET="$(socket_path)"
if [ -e "$SOCKET" ]; then
  if socket_in_use "$SOCKET"; then
    fail "IPC socket already appears active: $SOCKET. Stop the existing nf-shell or set up a separate user session."
  fi
  log "removing stale IPC socket: $SOCKET"
  rm -f "$SOCKET" || fail "could not remove stale socket: $SOCKET"
fi

SHELL_LOG="$SANDBOX/nf-shell.log"
touch "$SHELL_LOG" || fail "could not create nf-shell log"

log "starting nf-shell in sandbox: $SANDBOX"
(
  cd "$SANDBOX" || exit 1
  HOME="$SANDBOX/home" ./nf-shell >>"$SHELL_LOG" 2>&1
) &
SHELL_PID="$!"

printf '%s\n' "$SHELL_PID" >"$SANDBOX/nf-shell.pid"
printf '%s\n' "$SOCKET" >"$SANDBOX/nf-shell.sock"
cat >"$SANDBOX/blind-env.sh" <<EOF
export HOME="$SANDBOX/home"
export NEXTFRAME_BLIND_SANDBOX="$SANDBOX"
export NEXTFRAME_BLIND_SOCKET="$SOCKET"
EOF

elapsed=0
while [ "$elapsed" -lt "$READY_TIMEOUT" ]; do
  if ! kill -0 "$SHELL_PID" >/dev/null 2>&1; then
    log "nf-shell exited before ready"
    sed -n '1,120p' "$SHELL_LOG" >&2
    exit 1
  fi

  if grep -q '"event":"ready"' "$SHELL_LOG" 2>/dev/null && [ -e "$SOCKET" ]; then
    log "nf-shell ready pid=$SHELL_PID socket=$SOCKET"
    PREPARE_OK=1
    exit 0
  fi

  sleep 1
  elapsed=$((elapsed + 1))
done

log "timed out waiting for nf-shell ready after ${READY_TIMEOUT}s"
sed -n '1,160p' "$SHELL_LOG" >&2
kill "$SHELL_PID" >/dev/null 2>&1 || true
exit 1
