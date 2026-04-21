#!/usr/bin/env bash
# NextFrame v0.7.0 · 多模型 nf-agent (Rust) 并发 POC
# 每模型独立 workspace + per-model config · 真跑 clips pipeline

set -u

WT=/Users/Zhuanz/bigbang/NextFrame
POC_ROOT="$WT/tmp/multi-rust-poc"
SKILLS_DIR="$WT/crates/nf-agent/skills"
NF_AGENT="$WT/target/release/nf-agent"

mkdir -p "$POC_ROOT"

MODELS=(
  "Pro/MiniMaxAI/MiniMax-M2.5"
  "deepseek-ai/DeepSeek-V3.2"
  "Pro/zai-org/GLM-5.1"
  "Qwen/Qwen3.6-35B-A3B"
)

if [ -f "$WT/.env" ]; then
  set -a; source "$WT/.env"; set +a
fi
if [ -z "${SILICONFLOW_API_KEY:-}" ]; then
  echo "SILICONFLOW_API_KEY 未填"; exit 1
fi

export PATH="$WT/target/release:$PATH"

# 真实文字密集视频(TED 演讲)· 前 90s 够文字密度
URL="https://www.youtube.com/watch?v=qp0HIF3SfI4"
TITLE="Simon Sinek TED · How Great Leaders Inspire Action"
TASK="用 NextFrame 做 clips 剪辑 demo. 视频 URL $URL ($TITLE · 18 min 演讲). yt-dlp 时加 --download-sections '*0-90' 下前 90 秒. 按 clips skill 走完 6 步 · 终点 index.html. 第一动作 load_skill clips. plan 只挑 1 亮点. translate 一次 Bash heredoc 写 zh 翻译."

echo "================================================"
echo "NextFrame v0.7.0 · 多模型 nf-agent POC"
echo "视频: $TITLE"
echo "URL: $URL (前 90s)"
echo "模型数: ${#MODELS[@]} · 并发"
echo "POC_ROOT: $POC_ROOT"
echo "================================================"
echo ""

PIDS=()
for model in "${MODELS[@]}"; do
  slug="${model//\//-}"
  ws="$POC_ROOT/$slug"
  rm -rf "$ws"
  mkdir -p "$ws/workspace"

  # per-model config toml
  cat > "$ws/nf-agent.toml" <<CFG
[provider]
base_url = "https://api.siliconflow.cn/v1"
api_key_env = "SILICONFLOW_API_KEY"
model = "$model"

[system_prompt]
text = "你是通用 agent. 有 Bash / Read / load_skill 3 个 tool. 用户给任务后你自主规划 · 不懂时先 load_skill 看有没相关 skill. 每步做完调 tool · 不空想. 最后才 FINAL."

[pricing]
"Pro/MiniMaxAI/MiniMax-M2.5" = [0.80, 2.40]
"deepseek-ai/DeepSeek-V3.2" = [0.28, 0.42]
"Pro/zai-org/GLM-5.1" = [1.00, 3.00]
"Qwen/Qwen3.6-35B-A3B" = [0.42, 0.84]
CFG

  echo "-> 派 [$model]"
  echo "   ws: $ws · config: $ws/nf-agent.toml"

  (
    cd "$ws/workspace" || exit 1
    "$NF_AGENT" "$TASK" \
      --config "$ws/nf-agent.toml" \
      --skills-dir "$SKILLS_DIR" \
      --max-iters 60 \
      > "$ws/run.log" 2>&1
    code=$?
    echo "" >> "$ws/run.log"
    echo "=== runner exit: $code ===" >> "$ws/run.log"
  ) &
  PIDS+=($!)
done

echo ""
echo "等 ${#PIDS[@]} 模型跑完..."
wait "${PIDS[@]}"
echo ""
echo "================================================"
echo "所有模型跑完"
echo "================================================"

# summary
SUMMARY="$POC_ROOT/summary.md"
{
  echo "# v0.7.0 · nf-agent 多模型 POC · Simon Sinek TED"
  echo ""
  echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "URL: $URL (前 90s)"
  echo "模型数: ${#MODELS[@]}"
  echo ""
  echo "## 结果对比"
  echo ""
  echo "| 模型 | 产物数 | clip.mp4 | index.html | exit | iters | cost(USD) |"
  echo "|---|---|---|---|---|---|---|"
  for model in "${MODELS[@]}"; do
    slug="${model//\//-}"
    ws="$POC_ROOT/$slug"
    n=$(find "$ws/workspace" -type f 2>/dev/null | wc -l | tr -d ' ')
    clip=$(find "$ws/workspace" -name "clip_*.mp4" 2>/dev/null | head -1)
    [ -n "$clip" ] && clip_ok="✅" || clip_ok="❌"
    html=$(find "$ws/workspace" -name "index.html" 2>/dev/null | head -1)
    [ -n "$html" ] && html_ok="✅" || html_ok="❌"
    code=$(grep "=== runner exit:" "$ws/run.log" 2>/dev/null | grep -oE '[0-9]+$' | head -1)
    stats=$(grep "iters=" "$ws/run.log" 2>/dev/null | tail -1)
    iters=$(echo "$stats" | grep -oE 'iters=[0-9]+' | cut -d= -f2)
    cost=$(echo "$stats" | grep -oE 'est_cost_usd=[0-9.]+' | cut -d= -f2)
    echo "| \`$model\` | $n | $clip_ok | $html_ok | ${code:-?} | ${iters:-?} | ${cost:-?} |"
  done
} > "$SUMMARY"

cat "$SUMMARY"
echo ""
echo "产物详情: find $POC_ROOT -type f"
