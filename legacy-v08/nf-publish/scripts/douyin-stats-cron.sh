#!/bin/bash
# 抖音数据采集 cron 任务
# 模拟人类：先检查环境，慢慢点进去，采完数据退回首页
#
# cron 配置（每天 12:15，抖音 12 点更新数据）:
#   15 12 * * * /Users/Zhuanz/bigbang/MediaAgentTeam/automedia/scripts/douyin-stats-cron.sh
#
# 也可以手动跑：
#   bash scripts/douyin-stats-cron.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB=0
LOG_DIR="$AUTOMEDIA_BASE/data/stats/douyin"
LOG_FILE="$LOG_DIR/cron.log"
mkdir -p "$LOG_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

# ── 前置检查 ──

# 1. automedia 进程在不在
if ! pgrep -f "automedia" > /dev/null 2>&1; then
    log "SKIP: automedia 未运行"
    exit 0
fi

# 2. 抖音登录了没
login_result=$(wp_js $TAB '(function(){var h=window.location.href;if(h.indexOf("login")>=0||h.indexOf("passport")>=0)return "LOGIN_PAGE";return "OK";})()' 2>/dev/null || echo "error")
if echo "$login_result" | grep -q "LOGIN_PAGE\|error\|timeout"; then
    log "SKIP: 抖音未登录 ($login_result)"
    exit 0
fi

log "START: 开始采集"

# ── 模拟人类：先逛一圈 ──

# 随机等 10-60 秒再开始（不要每天精确同一秒请求）
sleep_sec=$(python3 -c "import random; print(random.randint(10, 60))")
log "等待 ${sleep_sec}s（模拟人类随机时间）"
sleep "$sleep_sec"

# 先在首页停一会儿，像人打开后台看了看
wp_js $TAB 'window.scrollTo(0, Math.random()*300)' 3 > /dev/null 2>&1
sleep $(python3 -c "import random; print(round(random.uniform(2, 5), 1))")
wp_js $TAB 'window.scrollTo(0, 0)' 3 > /dev/null 2>&1
sleep $(python3 -c "import random; print(round(random.uniform(1, 3), 1))")

# ── 采集 ──

data=$("$SCRIPT_DIR/douyin-stats.sh" snapshot 2>/dev/null)

if echo "$data" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    log "SUCCESS: 数据采集完成"

    # 采完回首页，像人看完数据关了
    wp_clickel $TAB "text:首页" > /dev/null 2>&1

    # 再随机停一会儿
    sleep $(python3 -c "import random; print(round(random.uniform(3, 8), 1))")

    log "DONE: 回到首页，采集结束"
else
    log "ERROR: 数据解析失败"
    log "RAW: $(echo "$data" | head -5)"
fi
