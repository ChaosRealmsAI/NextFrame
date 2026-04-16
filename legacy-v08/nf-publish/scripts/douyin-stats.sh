#!/bin/bash
# 抖音数据分析 — tab 0
# 安全模式：点击导航 → 等加载 → 下载 HTML → 离线解析
# 浏览器内零 JS 注入（除导航点击外）
#
# 用法: scripts/douyin-stats.sh <action>
#
# 动作:
#   account          账号总览（诊断雷达 + 昨日数据）
#   content          作品分析（投稿概览指标）
#   video            最新作品详情（单视频数据）
#   all              全部分析（account + content + video）
#   snapshot         全部分析 + 存档
#   history [N]      最近 N 天趋势

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB=0
HTML_FILE="/tmp/wp-html-${TAB}.html"
STATS_DIR="$HOME/Library/Application Support/com.opc.automedia"

# ── 人类模拟（零 JS） ──

_human_read_page() {
    local min_stay="${1:-5}" max_stay="${2:-10}"
    sleep $(python3 -c "import random; print(round(random.uniform(1.5, 3), 1))")
    # 用键盘滚动代替 JS scroll
    wp_key $TAB "down" > /dev/null 2>&1; sleep 0.5
    wp_key $TAB "down" > /dev/null 2>&1; sleep 0.5
    wp_key $TAB "down" > /dev/null 2>&1
    sleep $(python3 -c "import random; print(round(random.uniform($min_stay, $max_stay), 1))")
    wp_key $TAB "up" > /dev/null 2>&1; sleep 0.3
    wp_key $TAB "up" > /dev/null 2>&1; sleep 0.3
    wp_key $TAB "up" > /dev/null 2>&1
    sleep $(python3 -c "import random; print(round(random.uniform(1, 2), 1))")
}

# ── 侧边栏导航（保留最小 JS：只点击，不读数据） ──

_expand_data_center() {
    info "展开数据中心" >&2
    wp_exec $TAB 'clickel text:数据中心' 5 >&2
    wp_human_delay 2 3
}

_click_nav() {
    local name="$1"
    info "点击: $name" >&2
    wp_exec $TAB "clickel text:$name" 5 >&2
    wp_human_delay 3 5
}

# ── 下载 + 离线解析 ──

_download_html() {
    info "下载 HTML" >&2
    wp_html $TAB >&2
    # 确认文件存在
    if [ ! -f "$HTML_FILE" ]; then
        echo '{"error":"html download failed"}' ; return 1
    fi
}

# 从 HTML 文件离线提取账号数据
_parse_account() {
    python3 << 'PYEOF'
import re, json, sys

with open("/tmp/wp-html-0.html", "r") as f:
    text = f.read()

# 去掉 HTML 标签，得到纯文本
import html as html_mod
clean = re.sub(r'<[^>]+>', '\n', text)
clean = html_mod.unescape(clean)

r = {}

# 诊断百分位
diag = {}
m = re.search(r'视频播放量为(\d+)[，,].*?(\d+\.?\d*)%', clean)
if m: diag['play_count'] = int(m.group(1)); diag['play_rank_pct'] = float(m.group(2))
m = re.search(r'完播率为([\d.]+)%', clean)
if m: diag['completion_rate'] = float(m.group(1))
m = re.search(r'互动指数为([\d.]+)%', clean)
if m: diag['interaction_index'] = float(m.group(1))
m = re.search(r'新增粉丝.*?为(-?\d+)', clean)
if m: diag['net_fans'] = int(m.group(1))
m = re.search(r'投稿数为(\d+)', clean)
if m: diag['post_count'] = int(m.group(1))
r['diagnosis'] = diag

# 粉丝数
m = re.search(r'粉丝\s*(\d+)', clean)
if m: r['fans'] = int(m.group(1))

# 数据表现行（导出数据后面的数字）
m = re.search(r'导出数据(.{0,500})', clean, re.DOTALL)
if m:
    nums = re.findall(r'[\d,.-]+', m.group(1))
    if len(nums) >= 8:
        r['overview'] = {
            'play_count': nums[0], 'profile_visits': nums[1],
            'likes': nums[2], 'shares': nums[3], 'comments': nums[4],
            'cover_click_rate': nums[5], 'net_fans': nums[6], 'unfollowed': nums[7]
        }

print(json.dumps(r, ensure_ascii=False))
PYEOF
}

# 从 HTML 文件离线提取作品分析
_parse_content() {
    python3 << 'PYEOF'
import re, json, html as html_mod

with open("/tmp/wp-html-0.html", "r") as f:
    text = f.read()
clean = re.sub(r'<[^>]+>', '\n', text)
clean = html_mod.unescape(clean)

r = {}
metrics = [
    ("post_count", "周期内投稿量"), ("avg_click_rate", "条均点击率"),
    ("avg_5s_completion", "条均5s完播率"), ("avg_2s_bounce", "条均2s跳出率"),
    ("avg_play_duration", "条均播放时长"), ("median_plays", "播放量中位数"),
    ("avg_likes", "条均点赞数"), ("avg_comments", "条均评论量"),
    ("avg_shares", "条均分享量")
]
for key, label in metrics:
    idx = clean.find(label)
    if idx >= 0:
        after = clean[idx+len(label):idx+len(label)+50]
        m = re.search(r'([\d,.]+%?|[\d,.]+秒?|-)', after)
        r[key] = m.group(1) if m else "-"

m = re.search(r'(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})', clean)
if m: r['date_from'] = m.group(1); r['date_to'] = m.group(2)

print(json.dumps(r, ensure_ascii=False))
PYEOF
}

# 从作品管理页 HTML 提取视频数据（metric-value/metric-label class）
_parse_video() {
    python3 << 'PYEOF'
import re, json, html as html_mod

with open("/tmp/wp-html-0.html", "r") as f:
    text = f.read()

# 去掉 style 标签（CSS 里的 class 名会干扰）
text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)

# 提取 metric-label 和 metric-value 配对
labels = re.findall(r'metric-label[^"]*"[^>]*>([^<]+)', text)
values = re.findall(r'metric-value[^"]*"[^>]*>([^<]+)', text)

# 提取日期
dates = re.findall(r'info-time[^"]*"[^>]*>([^<]+)', text)

# 提取标题
titles = re.findall(r'info-title-text[^"]*"[^>]*>([^<]+)', text)

# 提取总数
count_m = re.search(r'共\s*(\d+)\s*个作品', text)

items = []
# labels 按每 8 个一组（播放/平均播放时长/封面点击率/点赞/评论/分享/收藏/弹幕）
label_names = ["plays", "avg_duration", "cover_click_rate", "likes", "comments", "shares", "saves", "danmaku"]
chunk_size = len(label_names)

for i in range(0, len(values), chunk_size):
    chunk = values[i:i+chunk_size]
    if len(chunk) < chunk_size:
        break
    item = {}
    for j, key in enumerate(label_names):
        item[key] = chunk[j].strip()
    # 匹配标题和日期
    video_idx = i // chunk_size
    if video_idx < len(titles):
        item["title"] = titles[video_idx].strip()[:60]
    if video_idx < len(dates):
        item["date"] = dates[video_idx].strip()
    items.append(item)

print(json.dumps({
    "platform": "抖音",
    "total": int(count_m.group(1)) if count_m else len(items),
    "items": items
}, ensure_ascii=False, indent=2))
PYEOF
}

# ── 流程 ──

_go_content_manage() {
    info "去作品管理" >&2
    _click_nav "内容管理"
    wp_human_delay 1 2
    _click_nav "作品管理"
    wp_human_delay 2 4
}

do_account() {
    info "=== 账号总览 ===" >&2
    _expand_data_center
    _click_nav "账号总览"
    _human_read_page 8 15 >&2
    _download_html
    _parse_account
}

do_content() {
    info "=== 作品分析 ===" >&2
    _expand_data_center
    _click_nav "作品分析"
    _human_read_page 6 12 >&2
    _download_html
    _parse_content
}

do_video() {
    info "=== 作品管理 ===" >&2
    _go_content_manage
    _human_read_page 5 10 >&2
    _download_html
    _parse_video
}

do_all() {
    local video_json account_json content_json

    # 1. 作品管理（每个视频的详细数据）
    _go_content_manage
    _human_read_page 5 10 >&2
    _download_html
    video_json=$(_parse_video)

    # 2. 账号总览
    _expand_data_center
    _click_nav "账号总览"
    _human_read_page 8 15 >&2
    _download_html
    account_json=$(_parse_account)

    # 3. 作品分析
    _click_nav "作品分析"
    _human_read_page 6 12 >&2
    _download_html
    content_json=$(_parse_content)

    python3 -c "
import json
ts = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
print(json.dumps({
    'ts': ts, 'platform': '抖音',
    'video': json.loads('''$video_json'''),
    'account': json.loads('''$account_json'''),
    'content': json.loads('''$content_json''')
}, ensure_ascii=False, indent=2))
"
}

do_snapshot() {
    info "=== 数据快照 ===" >&2
    local data today daily_dir daily_file
    data=$(do_all)
    echo "$data"
    today=$(date +%Y-%m-%d)
    daily_dir="$AUTOMEDIA_BASE/data/stats/douyin"
    mkdir -p "$daily_dir"
    daily_file="$daily_dir/$today.jsonl"
    local one_line
    one_line=$(echo "$data" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin); d['type'] = 'stats_snapshot'
    print(json.dumps(d, ensure_ascii=False))
except: print('{\"type\":\"stats_snapshot\",\"error\":\"parse_failed\"}')" 2>/dev/null)
    echo "$one_line" >> "$daily_file"
    echo "$one_line" >> "$STATS_DIR/activity.jsonl"
    ok "存档: $daily_file" >&2
}

do_history() {
    local daily_dir="$AUTOMEDIA_BASE/data/stats/douyin"
    local days="${2:-7}"
    ls -1 "$daily_dir"/*.jsonl 2>/dev/null | tail -"$days" | while read -r f; do
        local day; day=$(basename "$f" .jsonl)
        echo "--- $day ---"
        tail -1 "$f" | python3 -c "
import sys, json
d = json.load(sys.stdin)
v = d.get('video', {}); a = d.get('account', {}); diag = a.get('diagnosis', {})
print(f'  播放: {v.get(\"play_count\",\"-\")}  粉丝: {a.get(\"fans\",\"-\")}  净增: {a.get(\"overview\",{}).get(\"net_fans\",\"-\")}')
print(f'  诊断: 排名{diag.get(\"play_rank_pct\",\"-\")}%  完播{diag.get(\"completion_rate\",\"-\")}%  互动{diag.get(\"interaction_index\",\"-\")}%')
" 2>/dev/null
    done
}

case "${1:-help}" in
account)    do_account ;;
content)    do_content ;;
video)      do_video ;;
all)        do_all ;;
snapshot)   do_snapshot ;;
history)    do_history "$@" ;;
screenshot) wp_screenshot $TAB ;;
*)
    echo "抖音数据分析 (tab $TAB) — 安全模式"
    echo "用法: douyin-stats.sh <action>"
    echo ""
    echo "  account       账号总览"
    echo "  content       作品分析"
    echo "  video         最新作品"
    echo "  all           全部（JSON）"
    echo "  snapshot      全部 + 存档"
    echo "  history [N]   最近 N 天趋势"
    echo ""
    echo "原理: 点击导航 → 等加载 → wp_html 下载 → Python 离线解析"
    ;;
esac
