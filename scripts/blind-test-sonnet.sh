#!/usr/bin/env bash
# Run a blind sonnet-level AI acceptance harness for the v0.2 core CLI flow.
# Usage: ./scripts/blind-test-sonnet.sh [backend] [model] [session]

set -u
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="${1:-codex}"
MODEL="${2:-gpt-5-mini}"
RAW_SESSION="${3:-blind-${MODEL}-$(date +%s)}"
SESSION="$(printf '%s' "$RAW_SESSION" | sed 's/[^A-Za-z0-9._-]/-/g')"
TMP_DIR="$ROOT/tmp"
SANDBOX="${NEXTFRAME_BLIND_SANDBOX:-$TMP_DIR/sonnet-sandbox-$SESSION}"
PROMPT_FILE="$TMP_DIR/blind-prompt-$SESSION.md"
LOG_FILE="$TMP_DIR/blind-$SESSION.log"
TIMEOUT_SECONDS="${NEXTFRAME_BLIND_TIMEOUT:-300}"
ALLY_BIN="${ALLY_BIN:-ally}"
PREPARED=0

mkdir -p "$TMP_DIR"
: >"$LOG_FILE"

log() {
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$LOG_FILE"
}

cleanup_on_exit() {
  status=$?
  if [ "$PREPARED" = "1" ] && [ "${KEEP_BLIND_SANDBOX:-0}" != "1" ]; then
    "$ROOT/scripts/cleanup-blind-sandbox.sh" "$SANDBOX" >>"$LOG_FILE" 2>&1 || true
  elif [ "$PREPARED" = "1" ]; then
    log "keeping sandbox because KEEP_BLIND_SANDBOX=1: $SANDBOX"
  fi
  exit "$status"
}

trap cleanup_on_exit EXIT INT TERM

write_prompt() {
  cat >"$PROMPT_FILE" <<'EOF'
你是 sonnet 级 AI。任务: 只用 NextFrame CLI 完成端到端视频项目设置。

严格禁止:
- 读源码、README、spec、测试文件、package/cargo 配置或任何仓库文件
- 使用网络
- 直接猜内部存储格式

唯一允许的信息来源:
- `./nf --help`
- `./nf help ...`
- `./nf <子命令> --help` 或更深层子命令 help
- 失败命令返回的 stderr JSON/hint

环境:
- 当前目录就是 sandbox
- `HOME` 已指向 sandbox 内部目录，不会污染真实用户目录
- `nf` binary 在 `./nf`
- `nf-shell` 已后台启动，IPC socket 已 ready

目标: 按顺序完成 7 个语义步骤。
1. 创建 project: slug=demo, name='Demo'
2. 创建 episode: project=demo, slug=ep-01, name='一', duration=10
3. 创建 clip: project=demo, episode=ep-01, slug=c-01, start=0, end=5
4. 设置 anchor: project=demo, episode=ep-01, name=feat-1-end, time/at=4.5
5. 打开 window: project=demo, episode=ep-01
6. 截图: project=demo, episode=ep-01, out=tmp/sonnet.png
7. 退出应用

要求:
- 每个语义步骤先运行相关 help，再运行正式命令。
- 如果 help 显示有额外必填字段，选择最小合理值继续，例如 clip 的 label/track。
- 如果 flag 名称和目标描述不同，以 help 和错误 hint 为准。
- 每条正式命令都必须 exit 0；失败时最多根据 stderr hint 修正重试 2 次。
- 日志中逐条输出: 时间戳、命令原文、exit code、stdout、stderr。
- 最终输出每步正式命令原文和 JSON 返回。
- 最后一行必须是 `SUMMARY: PASS` 或 `SUMMARY: FAIL`。
EOF
}

write_fake_png() {
  out="$1"
  mkdir -p "$(dirname "$out")"
  if printf '' | base64 --decode >/dev/null 2>&1; then
    base64 --decode >"$out" <<'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=
EOF
  else
    base64 -D >"$out" <<'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=
EOF
  fi
}

prepare_fake_sandbox() {
  rm -rf "$SANDBOX"
  mkdir -p "$SANDBOX/tmp" "$SANDBOX/home/.nextframe"
  PREPARED=1
  log "fake sandbox prepared: $SANDBOX"
}

run_fake_pass() {
  storage="$SANDBOX/home/.nextframe"
  mkdir -p "$storage/demo/episodes" "$SANDBOX/tmp"
  cat >"$storage/registry.json" <<'EOF'
{"projects":[{"slug":"demo","name":"Demo","created":"fake","last_modified":"fake"}]}
EOF
  cat >"$storage/demo/project.json" <<'EOF'
{"slug":"demo","name":"Demo","created":"fake","modified":"fake"}
EOF
  cat >"$storage/demo/episodes/ep-01.json" <<'EOF'
{"slug":"ep-01","name":"\u4e00","duration":10.0,"anchors":{"feat-1-end":4.5},"clips":[{"slug":"c-01","start":0,"end":5}],"log":[]}
EOF
  write_fake_png "$SANDBOX/tmp/sonnet.png"
  {
    printf '[%s] command: ./nf projects create --slug=demo --name=Demo\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '{"slug":"demo","name":"Demo"}\nexit=0\n'
    printf '[%s] command: ./nf episodes create --project=demo --slug=ep-01 --name=一 --duration=10\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '{"slug":"ep-01","duration":10}\nexit=0\n'
    printf '[%s] command: ./nf clips create --project=demo --episode=ep-01 --slug=c-01 --start=0 --end=5\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '{"slug":"c-01","start":0,"end":5}\nexit=0\n'
    printf '[%s] command: ./nf anchors set --project=demo --episode=ep-01 --name=feat-1-end --time=4.5\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '{"feat-1-end":4.5}\nexit=0\n'
    printf '[%s] command: ./nf open --project=demo --episode=ep-01\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '{"window":"fake"}\nexit=0\n'
    printf '[%s] command: ./nf screenshot --project=demo --episode=ep-01 --out=tmp/sonnet.png\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '{"out":"tmp/sonnet.png"}\nexit=0\n'
    printf '[%s] command: ./nf quit\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '{"quit":true}\nexit=0\n'
    printf 'SUMMARY: PASS\n'
  } >>"$LOG_FILE"
  return 0
}

run_fake_fail() {
  mkdir -p "$SANDBOX/tmp"
  {
    printf '[%s] command: ./nf projects create --slug=demo --name=Demo\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf '{"slug":"demo","name":"Demo"}\nexit=0\n'
    printf '[%s] command: ./nf screenshot --project=demo --episode=ep-01 --out=tmp/sonnet.png\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf 'stderr={"error":"not found","hint":"create the episode first"}\nexit=1\n'
    printf 'SUMMARY: FAIL\n'
  } >>"$LOG_FILE"
  return 1
}

wait_with_timeout() {
  pid="$1"
  limit="$2"
  marker="$TMP_DIR/blind-timeout-$SESSION-$pid"
  rm -f "$marker"
  (
    sleep "$limit"
    if kill -0 "$pid" >/dev/null 2>&1; then
      printf 'timeout\n' >"$marker"
      log "timeout after ${limit}s; terminating pid=$pid"
      kill "$pid" >/dev/null 2>&1 || true
      sleep 2
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  ) &
  watchdog_pid="$!"

  wait "$pid"
  status=$?
  kill "$watchdog_pid" >/dev/null 2>&1 || true
  wait "$watchdog_pid" >/dev/null 2>&1 || true

  if [ -f "$marker" ]; then
    rm -f "$marker"
    return 124
  fi

  return "$status"
}

run_ally() {
  if ! command -v "$ALLY_BIN" >/dev/null 2>&1; then
    log "ally command not found: $ALLY_BIN"
    return 127
  fi

  prompt_content="$(cat "$PROMPT_FILE")"
  log "starting ally backend=$BACKEND model=$MODEL session=$SESSION timeout=${TIMEOUT_SECONDS}s"
  (
    cd "$SANDBOX" || exit 1
    export HOME="$SANDBOX/home"
    "$ALLY_BIN" run \
      --backend "$BACKEND" \
      --model "$MODEL" \
      --prompt "$prompt_content" \
      --dir "$SANDBOX" \
      --session "$SESSION"
  ) >>"$LOG_FILE" 2>&1 &
  ally_pid="$!"
  wait_with_timeout "$ally_pid" "$TIMEOUT_SECONDS"
  return $?
}

is_png() {
  path="$1"
  [ -f "$path" ] || return 1
  if command -v file >/dev/null 2>&1; then
    file "$path" | grep -qi 'PNG image data'
    return $?
  fi
  return 0
}

judge() {
  png="$SANDBOX/tmp/sonnet.png"
  registry="$SANDBOX/home/.nextframe/registry.json"
  project="$SANDBOX/home/.nextframe/demo/project.json"
  episode="$SANDBOX/home/.nextframe/demo/episodes/ep-01.json"

  summary_ok=0
  png_ok=0
  json_ok=0

  grep -q 'SUMMARY:[[:space:]]*PASS' "$LOG_FILE" && summary_ok=1
  is_png "$png" && png_ok=1
  if [ -s "$registry" ] && [ -s "$project" ] && [ -s "$episode" ]; then
    json_ok=1
  fi

  log "judge summary=$summary_ok png=$png_ok json=$json_ok"

  if [ "$summary_ok" = "1" ] && [ "$png_ok" = "1" ] && [ "$json_ok" = "1" ]; then
    log "BLIND TEST PASS session=$SESSION log=$LOG_FILE"
    return 0
  fi

  log "BLIND TEST FAIL session=$SESSION log=$LOG_FILE"
  return 1
}

write_prompt
log "session=$SESSION backend=$BACKEND model=$MODEL sandbox=$SANDBOX"

case "${NEXTFRAME_BLIND_FAKE:-$BACKEND}" in
  fake-pass|pass)
    prepare_fake_sandbox
    run_fake_pass || true
    ;;
  fake-fail|fail)
    prepare_fake_sandbox
    run_fake_fail || true
    ;;
  *)
    "$ROOT/scripts/prepare-blind-sandbox.sh" "$SANDBOX" >>"$LOG_FILE" 2>&1
    prepare_status=$?
    if [ "$prepare_status" != "0" ]; then
      log "prepare failed with exit=$prepare_status"
      exit "$prepare_status"
    fi
    PREPARED=1
    run_ally
    ally_status=$?
    log "ally exit=$ally_status"
    ;;
esac

judge
