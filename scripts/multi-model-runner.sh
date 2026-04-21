#!/usr/bin/env bash
# NextFrame v0.1.9 · 硅基多模型 POC harness
# 并发跑多个模型 · 每模型独立 workspace · 共享 agent-demo.py
# 用户填 .env 里 SILICONFLOW_API_KEY 后 `bash scripts/multi-model-runner.sh`

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT="$(cd "$SCRIPT_DIR/.." && pwd)"
POC_ROOT="$WT/tmp/multi-model-poc"
mkdir -p "$POC_ROOT"

MODELS=(
  "Pro/MiniMaxAI/MiniMax-M2.5"
  "deepseek-ai/DeepSeek-V3.2"
  "Pro/zai-org/GLM-4.7"
  "Qwen/Qwen3-30B-A3B"
)

if [ -f "$WT/.env" ]; then
  set -a; source "$WT/.env"; set +a
fi

if [ -z "${SILICONFLOW_API_KEY:-}" ] || [ "$SILICONFLOW_API_KEY" = "sk-your-key-here" ]; then
  echo "SILICONFLOW_API_KEY 未填"
  echo ""
  echo "cd $WT"
  echo "cp .env.example .env"
  echo "# 编辑 .env 填 SILICONFLOW_API_KEY=sk-xxx"
  echo "bash scripts/multi-model-runner.sh"
  exit 1
fi

GUIDE_TEMPLATE="$WT/spec/prompts/v0.1.9-poc-guide.md.template"
if [ ! -f "$GUIDE_TEMPLATE" ]; then
  echo "guide template 缺:$GUIDE_TEMPLATE"
  exit 1
fi

echo "================================================"
echo "NextFrame v0.1.9 · 硅基多模型 POC"
echo "模型数: ${#MODELS[@]} · 并发"
echo "POC_ROOT: $POC_ROOT"
echo "================================================"
echo ""

PIDS=()
for model in "${MODELS[@]}"; do
  slug="${model//\//-}"
  ws="$POC_ROOT/$slug"
  rm -rf "$ws"
  mkdir -p "$ws/outputs"

  sed "s|{{WORKSPACE}}|$ws|g" "$GUIDE_TEMPLATE" > "$ws/guide.md"
  task=$(cat "$ws/guide.md")

  echo "-> 派 [$model]"
  echo "   workspace: $ws"
  echo "   log:       $ws/run.log"

  (
    export SILICONFLOW_MODEL="$model"
    python3 "$WT/scripts/agent-demo.py" --max-iters 15 "$task" \
      > "$ws/run.log" 2>&1
    code=$?
    echo "" >> "$ws/run.log"
    echo "=== runner exit code: $code ===" >> "$ws/run.log"
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
echo ""

SUMMARY="$POC_ROOT/summary.md"
{
  echo "# v0.1.9 · 硅基多模型 POC 结果"
  echo ""
  echo "生成时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "模型数: ${#MODELS[@]}"
  echo ""
  echo "## 结果对比"
  echo ""
  echo "| 模型 | 产物数 | hello.mp3 时长 | HTML 存在 | exit code |"
  echo "|---|---|---|---|---|"
  for model in "${MODELS[@]}"; do
    slug="${model//\//-}"
    ws="$POC_ROOT/$slug"
    n=$(ls "$ws/outputs/" 2>/dev/null | wc -l | tr -d ' ')
    mp3_dur="-"
    if [ -f "$ws/outputs/hello.mp3" ]; then
      mp3_dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$ws/outputs/hello.mp3" 2>/dev/null | cut -c1-6)
      mp3_dur="${mp3_dur}s"
    fi
    html_ok="NO"
    [ -f "$ws/outputs/hello.html" ] && html_ok="YES"
    code=$(grep "=== runner exit code:" "$ws/run.log" 2>/dev/null | grep -oE '[0-9]+$' | head -1)
    echo "| \`$model\` | $n | $mp3_dur | $html_ok | ${code:-?} |"
  done
  echo ""
  echo "## 每模型详情"
  echo ""
  for model in "${MODELS[@]}"; do
    slug="${model//\//-}"
    ws="$POC_ROOT/$slug"
    echo "### $model"
    echo ""
    echo "产物:"
    echo "\`\`\`"
    ls -la "$ws/outputs/" 2>/dev/null | tail -n +2 || echo "(空)"
    echo "\`\`\`"
    echo ""
    echo "run.log 末 10 行:"
    echo "\`\`\`"
    tail -10 "$ws/run.log" 2>/dev/null || echo "(无 log)"
    echo "\`\`\`"
    echo ""
  done
} > "$SUMMARY"

echo "summary: $SUMMARY"
cat "$SUMMARY" | head -30
echo ""
echo "全文: cat $SUMMARY"
