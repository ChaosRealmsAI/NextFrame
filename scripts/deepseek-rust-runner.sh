#!/usr/bin/env bash
# NextFrame v0.7.1 · DeepSeek V3.2 专属 runner(用户指定唯一模型)
# 用新 engine(anti-fake-FINAL + verify_outputs)跑 clips pipeline
# 用法: bash scripts/deepseek-rust-runner.sh [video_url] [title]

set -u

WT=$(git rev-parse --show-toplevel)
POC_ROOT="$WT/tmp/deepseek-rust-poc"
SKILLS_DIR="$WT/crates/nf-agent/skills"
NF_AGENT="$WT/target/release/nf-agent"

if [ ! -x "$NF_AGENT" ]; then
  echo "需 cargo build --release -p nf-agent 先编译"
  exit 1
fi

mkdir -p "$POC_ROOT"

if [ -f "$WT/.env" ]; then
  set -a; source "$WT/.env"; set +a
fi
if [ -z "${SILICONFLOW_API_KEY:-}" ]; then
  echo "SILICONFLOW_API_KEY 未填"; exit 1
fi

export PATH="$WT/target/release:$PATH"

# 参数
URL="${1:-https://www.youtube.com/watch?v=qp0HIF3SfI4}"
TITLE="${2:-Simon Sinek TED · How Great Leaders Inspire Action}"
MODEL="deepseek-ai/DeepSeek-V3.2"
SLUG="${MODEL//\//-}-$(date +%H%M%S)"
WS="$POC_ROOT/$SLUG"
rm -rf "$WS"
mkdir -p "$WS/workspace"

TASK="用 NextFrame 做 clips 剪辑 demo. 视频 URL $URL ($TITLE). yt-dlp 时必加 --download-sections '*0-90' 下前 90 秒. 按 clips skill 走完 6 步 · 终点 index.html. 第一动作 load_skill clips. plan 只挑 1 亮点. translate 一次 Bash heredoc 写完整 zh 翻译. 你最后 FINAL 前请用 verify_outputs 工具校验产物齐全."

cat > "$WS/nf-agent.toml" <<CFG
final_check_enabled = true

[provider]
base_url = "https://api.siliconflow.cn/v1"
api_key_env = "SILICONFLOW_API_KEY"
model = "$MODEL"

[system_prompt]
text = "你是通用 agent. 有 Bash / Read / load_skill / verify_outputs 4 个 tool. 用户给任务后你自主规划 · 不懂时先 load_skill 看有没相关 skill · 每步做完调 tool · 不空想 · 最后 FINAL 前请调用 verify_outputs 确认产物齐全. 若 engine 说产物缺失就继续调 tool 补齐 · 别硬 FINAL."

[pricing]
"$MODEL" = [0.28, 0.42]
CFG

echo "================================================"
echo "NextFrame v0.7.1 · DeepSeek V3.2 · anti-fake-FINAL engine"
echo "视频: $TITLE"
echo "URL: $URL (前 90s)"
echo "ws: $WS"
echo "================================================"
echo ""

cd "$WS/workspace" || exit 1
START=$(date +%s)
"$NF_AGENT" "$TASK" \
  --config "$WS/nf-agent.toml" \
  --skills-dir "$SKILLS_DIR" \
  --max-iters 80 \
  --trace "$WS/trace.jsonl" \
  > "$WS/run.log" 2>&1
code=$?
END=$(date +%s)
echo "" >> "$WS/run.log"
echo "=== runner exit: $code ===" >> "$WS/run.log"
echo "=== elapsed: $((END-START))s ===" >> "$WS/run.log"

echo ""
echo "================================================"
echo "exit: $code · elapsed: $((END-START))s"
echo "================================================"

# summary
n=$(find "$WS/workspace" -type f 2>/dev/null | wc -l | tr -d ' ')
clip=$(find "$WS/workspace" -name "clip_*.mp4" 2>/dev/null | head -1)
html=$(find "$WS/workspace" -name "index.html" 2>/dev/null | head -1)
stats=$(grep "stats:" "$WS/run.log" 2>/dev/null | tail -1)

echo "files: $n · clip_*.mp4: ${clip:+✅ $clip}${clip:-❌} · index.html: ${html:+✅ $html}${html:-❌}"
echo "$stats"
echo ""
echo "详情: $WS/run.log"
echo "产物: find $WS/workspace -type f"

exit $code
