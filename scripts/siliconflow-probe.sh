#!/usr/bin/env bash
# NextFrame · v0.1.7 POC · 硅基流动 chat/completions 单 call 探测
#
# 用法:
#   bash scripts/siliconflow-probe.sh                    # 默认 prompt
#   bash scripts/siliconflow-probe.sh "你好 介绍一下你自己"
#   SILICONFLOW_MODEL=Qwen/Qwen3-8B bash scripts/siliconflow-probe.sh
#
# 输出(成功):
#   ✅ 状态 OK
#   → 模型: deepseek-ai/DeepSeek-V3
#   → 耗时: 842ms
#   → token: in=12 / out=47
#   → 返回: ...
#
# 退出码:
#   0 = 成功
#   1 = .env 缺失 / key 未填 / 依赖缺失
#   2 = API 返回 error
#   3 = 响应解析失败

set -euo pipefail

# ---- 定位项目根 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ---- 依赖检查 ----
for dep in curl jq; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    echo "❌ 依赖缺失: $dep · macOS 装 brew install $dep" >&2
    exit 1
  fi
done

# ---- .env 加载 ----
if [ ! -f .env ]; then
  echo "❌ .env 不存在" >&2
  echo "   cp .env.example .env · 然后填 SILICONFLOW_API_KEY" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${SILICONFLOW_API_KEY:-}" ] || [ "$SILICONFLOW_API_KEY" = "sk-your-key-here" ]; then
  echo "❌ SILICONFLOW_API_KEY 未填 · 占位符还是 sk-your-key-here" >&2
  echo "   申请: https://cloud.siliconflow.cn/account/ak" >&2
  exit 1
fi

# ---- 参数 ----
PROMPT="${1:-你好 · 用一句话介绍你自己}"
MODEL="${SILICONFLOW_MODEL:-deepseek-ai/DeepSeek-V3}"
BASE_URL="${SILICONFLOW_BASE_URL:-https://api.siliconflow.cn/v1}"

echo "→ 模型: $MODEL"
echo "→ prompt: $PROMPT"
echo ""

# ---- 构造 payload(jq 安全 escape 用户输入)----
PAYLOAD=$(jq -nc \
  --arg model "$MODEL" \
  --arg prompt "$PROMPT" \
  '{
    model: $model,
    messages: [{role: "user", content: $prompt}],
    stream: false
  }')

# ---- 发请求 + 计时 ----
START_NS=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
RESPONSE=$(curl -sS -X POST "$BASE_URL/chat/completions" \
  -H "Authorization: Bearer $SILICONFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")
END_NS=$(date +%s%N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1e9))')
ELAPSED_MS=$(( (END_NS - START_NS) / 1000000 ))

# ---- 错误处理 ----
if echo "$RESPONSE" | jq -e '.error // .code' >/dev/null 2>&1; then
  echo "❌ API 返回错误:" >&2
  echo "$RESPONSE" | jq '.' >&2
  exit 2
fi

TEXT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty')
if [ -z "$TEXT" ]; then
  echo "❌ 响应解析失败 · 原始:" >&2
  echo "$RESPONSE" | jq '.' >&2
  exit 3
fi

TOKENS_IN=$(echo "$RESPONSE" | jq -r '.usage.prompt_tokens // "?"')
TOKENS_OUT=$(echo "$RESPONSE" | jq -r '.usage.completion_tokens // "?"')

# ---- 输出 5 字段 ----
echo "✅ 状态 OK"
echo "→ 耗时: ${ELAPSED_MS}ms"
echo "→ token: in=${TOKENS_IN} / out=${TOKENS_OUT}"
echo "→ 返回:"
echo "$TEXT"
