#!/bin/bash
# 全平台内容管理数据采集 — 安全模式
# 点击导航 → 等加载 → 下载文本/HTML → 离线解析
# 浏览器内零数据提取 JS
#
# 用法: scripts/content-stats.sh <platform>
#
# 平台:
#   douyin        抖音 (tab 0) — wp_html + class 解析
#   xhs           小红书 (tab 1) — wp_text + 行解析
#   kuaishou      快手 (tab 5) — wp_text + 行解析
#   zhihu         知乎 (tab 6) — wp_text + 行解析
#   mp            公众号 (tab 4) — wp_text + 行解析
#   channels      视频号 (tab 3) — wp_html_shadow + HTML 解析
#   all           全部平台
#   snapshot      全部 + 按天存档

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# ── 人类模拟 ──

_human_read() {
    local min="${1:-5}" max="${2:-10}"
    sleep $(python3 -c "import random; print(round(random.uniform(1.5, 3), 1))")
    wp_key "$TAB" "down" > /dev/null 2>&1; sleep 0.5
    wp_key "$TAB" "down" > /dev/null 2>&1
    sleep $(python3 -c "import random; print(round(random.uniform($min, $max), 1))")
    wp_key "$TAB" "up" > /dev/null 2>&1; sleep 0.3
    wp_key "$TAB" "up" > /dev/null 2>&1
    sleep $(python3 -c "import random; print(round(random.uniform(1, 2), 1))")
}

# ── 抖音 (tab 0) — 作品管理页，用 HTML class 解析 ──

do_douyin() {
    TAB=0
    info "抖音: 作品管理" >&2
    wp_exec $TAB "clickel text:内容管理" 5 >&2; wp_human_delay 1 2
    wp_exec $TAB "clickel text:作品管理" 5 >&2; wp_human_delay 3 5
    _human_read 5 8 >&2
    wp_html $TAB >&2

    python3 << 'PYEOF'
import re, json
with open("/tmp/wp-html-0.html") as f: text = f.read()
text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
labels = re.findall(r'metric-label[^"]*"[^>]*>([^<]+)', text)
values = re.findall(r'metric-value[^"]*"[^>]*>([^<]+)', text)
dates = re.findall(r'info-time[^"]*"[^>]*>([^<]+)', text)
titles = re.findall(r'info-title-text[^"]*"[^>]*>([^<]+)', text)
count_m = re.search(r'共\s*(\d+)\s*个作品', text)
items = []
names = ["plays","avg_duration","cover_click_rate","likes","comments","shares","saves","danmaku"]
for i in range(0, len(values), 8):
    c = values[i:i+8]
    if len(c) < 8: break
    item = {n: c[j].strip() for j, n in enumerate(names)}
    vi = i // 8
    if vi < len(titles): item["title"] = titles[vi].strip()[:60]
    if vi < len(dates): item["date"] = dates[vi].strip()
    items.append(item)
print(json.dumps({"platform":"抖音","count":len(items),"items":items}, ensure_ascii=False))
PYEOF
}

# ── 小红书 (tab 1) — 笔记管理，纯文本解析 ──

do_xhs() {
    TAB=1
    info "小红书: 首页（数据概览 + 最新笔记）" >&2
    wp_exec $TAB "clickel text:首页" 5 >&2; wp_human_delay 3 5
    _human_read 5 8 >&2
    wp_text $TAB >&2

    python3 << 'PYEOF'
import re, json
with open("/tmp/wp-text-1.txt") as f: lines = [l.strip() for l in f.readlines() if l.strip()]
r = {"platform": "小红书"}

# 账号数据
for i, l in enumerate(lines):
    if l == "关注数" and i > 0: r["following"] = lines[i-1]
    if l == "粉丝数" and i > 0: r["followers"] = lines[i-1]
    if l == "获赞与收藏" and i > 0: r["likes_total"] = lines[i-1]

# 笔记数据总览：标签在上面一行，数值在下面一行
stat_labels = ["曝光数","观看数","点赞数","评论数","收藏数","分享数","净涨粉",
               "封面点击率","视频完播率"]
overview = {}
for i, l in enumerate(lines):
    if l in stat_labels and i+1 < len(lines):
        overview[l] = lines[i+1]
r["overview"] = overview

# 最新笔记（标题列表）
items = []
for i, l in enumerate(lines):
    m = re.match(r'^发布于\s*(.+)', l)
    if m:
        title = "未知"
        for j in range(i-1, max(0, i-3), -1):
            if len(lines[j]) > 3 and "发布" not in lines[j]: title = lines[j]; break
        items.append({"title": title[:50], "date": m.group(1)})
r["items"] = items
r["count"] = len(items)

print(json.dumps(r, ensure_ascii=False))
PYEOF
}

# ── 快手 (tab 5) — 视频管理，纯文本解析 ──

do_kuaishou() {
    TAB=5
    info "快手: 内容管理" >&2
    wp_exec $TAB "clickel text:内容管理" 5 >&2; wp_human_delay 2 4
    _human_read 5 8 >&2
    wp_text $TAB >&2

    python3 << 'PYEOF'
import re, json
with open("/tmp/wp-text-5.txt") as f: text = f.read()
count_m = re.search(r'共(\d+)个作品', text)
lines = [l.strip() for l in text.split('\n') if l.strip()]
items = []
for i, l in enumerate(lines):
    m = re.match(r'^(\d{4}[/.-]\d{2}[/.-]\d{2})', l)
    if not m: continue
    title = "未知"
    for j in range(i-1, max(0, i-4), -1):
        if len(lines[j]) > 5 and not re.match(r'^[\d/.-]+$', lines[j]):
            title = lines[j][:50]; break
    items.append({"title":title,"date":m.group(1)})
print(json.dumps({"platform":"快手","count":int(count_m.group(1)) if count_m else len(items),"items":items}, ensure_ascii=False))
PYEOF
}

# ── 知乎 (tab 6) — 内容管理，纯文本解析 ──

do_zhihu() {
    TAB=6
    info "知乎: 内容管理" >&2
    wp_exec $TAB "clickel text:内容管理" 5 >&2; wp_human_delay 3 5
    _human_read 5 8 >&2
    wp_text $TAB >&2

    python3 << 'PYEOF'
import re, json
with open("/tmp/wp-text-6.txt") as f: lines = [l.strip() for l in f.readlines() if l.strip()]
items = []
labels = ["播放","赞同","评论","收藏","喜欢","被浏览","关注","好问题","回答"]
for i, l in enumerate(lines):
    m = re.match(r'^发布于\s*(.+)$', l)
    if not m: continue
    title = "未知"
    for j in range(i-1, max(0, i-4), -1):
        if len(lines[j]) >= 2 and lines[j] not in labels and "编辑" not in lines[j] and "管理" not in lines[j] and "日期" not in lines[j] and lines[j] != "-":
            title = lines[j]; break
    stats = {}
    for k in range(i+1, min(i+15, len(lines))):
        if "编辑" in lines[k] or "发布于" in lines[k]: break
        if lines[k] in labels and k > 0 and re.match(r'^\d[\d,]*$', lines[k-1]):
            stats[lines[k]] = lines[k-1]
    items.append({"title":title[:50],"date":m.group(1).strip(),"stats":stats})
count_m = re.search(r'共\s*(\d+)\s*条', '\n'.join(lines))
print(json.dumps({"platform":"知乎","count":int(count_m.group(1)) if count_m else len(items),"items":items}, ensure_ascii=False))
PYEOF
}

# ── 公众号 (tab 4) — 发表记录，纯文本解析 ──

do_mp() {
    TAB=4
    info "公众号: 发表记录" >&2
    wp_exec $TAB "clickel text:发表记录" 5 >&2; wp_human_delay 3 5
    _human_read 5 8 >&2
    wp_text $TAB >&2

    python3 << 'PYEOF'
import re, json
with open("/tmp/wp-text-4.txt") as f: lines = [l.strip() for l in f.readlines() if l.strip()]
items = []
for i, l in enumerate(lines):
    m = re.match(r'^(星期[一二三四五六日]\s*\d{2}:\d{2}|\d{4}年\d{1,2}月\d{1,2}日)', l)
    if not m: continue
    status = lines[i+1] if i+1 < len(lines) else ""
    title = lines[i+2] if i+2 < len(lines) else status
    if len(title) < 2: title = status
    nums = []
    for j in range(i+1, min(i+5, len(lines))):
        nm = re.match(r'^(\d[\d,]*)$', lines[j])
        if nm: nums.append(nm.group(1))
    items.append({"title":title[:50],"date":m.group(1),"reads":nums[0] if nums else "-"})
count_m = re.search(r'全部\s*(\d+)', '\n'.join(lines))
print(json.dumps({"platform":"公众号","count":int(count_m.group(1)) if count_m else len(items),"items":items}, ensure_ascii=False))
PYEOF
}

# ── 视频号 (tab 3) — 视频管理，HTML Shadow DOM 解析 ──

do_channels() {
    TAB=3
    info "视频号: 视频管理" >&2
    wp_exec $TAB "clickel text:内容管理" 5 >&2; wp_human_delay 2 3
    wp_exec $TAB "clickel text:视频" 5 >&2; wp_human_delay 3 5
    _human_read 5 8 >&2
    wp_html_shadow $TAB >&2

    python3 << 'PYEOF'
import re, json
with open("/tmp/wp-html-3.html") as f: text = f.read()
text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
# 找所有日期行（视频号格式：2026年04月01日 08:10）
date_pattern = r'>(\d{4}年\d{2}月\d{2}日\s+\d{2}:\d{2})<'
dates = re.findall(date_pattern, text)
# 去重（页面可能有重复元素）
seen = set()
unique_dates = []
for d in dates:
    if d not in seen: seen.add(d); unique_dates.append(d)
# 找每个日期后面的数字（播放/点赞/评论/转发/收藏）
items = []
for d in unique_dates:
    idx = text.find(d)
    after = text[idx:idx+500]
    nums = re.findall(r'>([\d.]+万?)<', after)
    # 过滤掉日期里的数字
    stats = [n for n in nums if not re.match(r'^\d{4}$', n) and not re.match(r'^\d{2}$', n)]
    items.append({
        "date": d,
        "plays": stats[0] if stats else "-",
        "likes": stats[1] if len(stats) > 1 else "-",
        "comments": stats[2] if len(stats) > 2 else "-",
        "forwards": stats[3] if len(stats) > 3 else "-",
        "saves": stats[4] if len(stats) > 4 else "-"
    })
print(json.dumps({"platform":"视频号","count":len(items),"items":items}, ensure_ascii=False))
PYEOF
}

# ── 汇总 ──

do_all() {
    local results=()
    for platform in douyin xhs kuaishou zhihu mp channels; do
        info "--- $platform ---" >&2
        local data
        data=$(do_${platform} 2>/dev/null) || data='{"platform":"'$platform'","error":"failed"}'
        results+=("$data")
        wp_human_delay 2 4
    done

    python3 -c "
import json
ts = '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
platforms = []
for line in '''$(printf '%s\n' "${results[@]}")'''.strip().split('\n'):
    if line.strip():
        try: platforms.append(json.loads(line))
        except: pass
print(json.dumps({'ts': ts, 'platforms': platforms}, ensure_ascii=False, indent=2))
"
}

do_snapshot() {
    info "=== 内容快照 ===" >&2
    local data today
    data=$(do_all)
    echo "$data"
    today=$(date +%Y-%m-%d)
    echo "$data" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for p in d.get('platforms', []):
    name = {'抖音':'douyin','小红书':'xhs','快手':'kuaishou','知乎':'zhihu','公众号':'mp','视频号':'channels'}.get(p.get('platform',''), '')
    if name:
        path = 'data/stats/' + name + '/$today.jsonl'
        with open(path, 'a') as f:
            p['ts'] = d['ts']; p['type'] = 'content_snapshot'
            f.write(json.dumps(p, ensure_ascii=False) + '\n')
        print(f'  存档: {path}', file=sys.stderr)
" 2>&1 >&2
    ok "快照完成" >&2
}

case "${1:-help}" in
douyin)     do_douyin ;;
xhs)        do_xhs ;;
kuaishou)   do_kuaishou ;;
zhihu)      do_zhihu ;;
mp)         do_mp ;;
channels)   do_channels ;;
all)        do_all ;;
snapshot)   do_snapshot ;;
*)
    echo "全平台内容管理 — 安全模式（零 JS 注入）"
    echo "用法: content-stats.sh <platform>"
    echo ""
    echo "  douyin      抖音 (wp_html)"
    echo "  xhs         小红书 (wp_text)"
    echo "  kuaishou    快手 (wp_text)"
    echo "  zhihu       知乎 (wp_text)"
    echo "  mp          公众号 (wp_text)"
    echo "  channels    视频号 (wp_html_shadow)"
    echo "  all         全部"
    echo "  snapshot    全部 + 存档"
    echo ""
    echo "原理: clickel 导航 → wp_text/wp_html 下载 → Python 离线解析"
    ;;
esac
