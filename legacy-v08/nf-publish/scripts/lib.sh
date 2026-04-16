#!/bin/bash
# AutoMedia 通用操作库
# 每个平台脚本 source 这个文件

AUTOMEDIA_BASE="${AUTOMEDIA_BASE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# ── 通道文件 ──

wp_cmd_file()  { echo "/tmp/wp-cmd-$1.js"; }
wp_result_file() { echo "/tmp/wp-result-$1.txt"; }
wp_screenshot_file() { echo "/tmp/wp-screenshot-$1.png"; }
wp_upload_file() { echo "/tmp/wp-upload-path-$1.txt"; }

# ── 核心：发命令 + 等结果 ──

# wp_exec TAB CMD [TIMEOUT_S]
# 写命令到 cmd 文件，等结果文件更新，输出结果
wp_exec() {
    local tab="$1" cmd="$2" timeout="${3:-10}"
    local cmd_f result_f
    cmd_f=$(wp_cmd_file "$tab")
    result_f=$(wp_result_file "$tab")

    # 清旧结果
    rm -f "$result_f"
    # 写命令
    echo "$cmd" > "$cmd_f"
    # 等结果
    local elapsed=0
    while [ ! -f "$result_f" ] && [ "$elapsed" -lt "$timeout" ]; do
        sleep 0.3
        elapsed=$((elapsed + 1))
    done
    if [ -f "$result_f" ]; then
        cat "$result_f"
    else
        echo "error: timeout after ${timeout}s"
    fi
}

# wp_js TAB "javascript code" [TIMEOUT_S]
wp_js() { wp_exec "$1" "$2" "${3:-10}"; }

# wp_screenshot TAB
wp_screenshot() { wp_exec "$1" "screenshot" 5; }

# wp_check TAB — session health JSON for current page/platform
wp_check() { wp_exec "$1" "check" "${2:-8}"; }

# wp_screenshot_el TAB "selector" — full screenshot + element rect
wp_screenshot_el() { wp_exec "$1" "screenshot_el $(wp_quote_arg "$2")" "${3:-8}"; }

# wp_goto TAB URL
wp_goto() { wp_exec "$1" "goto $2" 5; }

# wp_click TAB X Y
wp_click() { wp_exec "$1" "click $2 $3" 5; }

# Encode an argument as a JSON string so command parsing preserves spaces and quotes.
wp_quote_arg() {
    python3 - "$1" <<'PY'
import json, sys
print(json.dumps(sys.argv[1]), end="")
PY
}

# wp_clickel TAB "text:xxx" or "selector"
wp_clickel() { wp_exec "$1" "clickel $2" 5; }

# wp_hover TAB "selector"
wp_hover() { wp_exec "$1" "hover $(wp_quote_arg "$2")" 5; }

# wp_hover_xy TAB X Y
wp_hover_xy() { wp_exec "$1" "hover_xy $2 $3" 5; }

# wp_dblclick TAB "selector"
wp_dblclick() { wp_exec "$1" "dblclick $(wp_quote_arg "$2")" 5; }

# wp_dblclick_xy TAB X Y
wp_dblclick_xy() { wp_exec "$1" "dblclick_xy $2 $3" 5; }

# wp_rightclick TAB "text:xxx" or "selector"
wp_rightclick() { wp_exec "$1" "rightclick $(wp_quote_arg "$2")" 5; }

# wp_drag TAB "from_selector" "to_selector"
wp_drag() { wp_exec "$1" "drag $(wp_quote_arg "$2") $(wp_quote_arg "$3")" 5; }

# wp_type TAB "text"
wp_type() { wp_exec "$1" "type $2" 10; }

# wp_key TAB "key combo"
wp_key() { wp_exec "$1" "key $2" 3; }

# wp_paste TAB "text"
wp_paste() { wp_exec "$1" "paste $2" 5; }

# wp_inputel TAB "selector" "text" — 找元素 → native click 拿焦点 → 粘贴文字。一条命令搞定输入。
# 解决 JS focus ≠ 真实焦点的问题。所有 contenteditable/textarea/input 通用。
wp_inputel() { wp_exec "$1" "inputel \"$2\" $3" 10; }

# wp_upload TAB FILE_PATH
# 写路径文件 + 点击 file input
wp_upload() {
    local tab="$1" file="$2"
    echo "$file" > "$(wp_upload_file "$tab")"
    wp_js "$tab" '(function(){var i=document.querySelector("input[type=file]");if(i){i.click();return "ok";}return "no file input";})()' 5
}

# wp_upload_shadow TAB FILE_PATH
# Shadow DOM 版上传（视频号用）
wp_upload_shadow() {
    local tab="$1" file="$2"
    echo "$file" > "$(wp_upload_file "$tab")"
    wp_js "$tab" '(function(){var apps=document.querySelectorAll("wujie-app");for(var j=0;j<apps.length;j++){if(apps[j].shadowRoot){var inp=apps[j].shadowRoot.querySelector("input[type=file]");if(inp){inp.click();return "ok";}}}return "no file input";})()' 5
}

# wp_wait TAB "js_check_expression" [TIMEOUT_S] [INTERVAL_S]
# 轮询执行 JS，直到返回值不以 "ok: null" 或 "ok: false" 结尾
wp_wait() {
    local tab="$1" check_js="$2" timeout="${3:-30}" interval="${4:-3}"
    local elapsed=0
    while [ "$elapsed" -lt "$timeout" ]; do
        local result
        result=$(wp_js "$tab" "$check_js" 5)
        if echo "$result" | grep -qv "null\|false\|uploading\|WAITING"; then
            echo "$result"
            return 0
        fi
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done
    echo "error: wait timeout after ${timeout}s"
    return 1
}

# ── 人类模拟 ──

# wp_human_delay [MIN_S] [MAX_S] — 随机延迟，模拟人类节奏
wp_human_delay() {
    local min="${1:-1.5}" max="${2:-4}"
    sleep "$(python3 -c "import random; print(round(random.uniform($min, $max), 1))")"
}

# wp_browse TAB — 模拟"逛一圈"（在首页停留几秒，像人类一样）
wp_browse() {
    local tab="$1"
    info "browse: looking around..."
    wp_js "$tab" 'window.scrollTo(0, Math.random()*500)' 3
    wp_human_delay 3 8
    wp_js "$tab" 'window.scrollTo(0, 0)' 3
    wp_human_delay 1 3
}

# ── 进程管理 ──

# wp_reload TAB — 刷新单个 tab（不重启进程，保持 session）
wp_reload() { wp_exec "$1" "reload" 5; }

# wp_reload_all — 刷新所有 tab
wp_reload_all() { wp_exec "0" "reload_all" 5; }

# wp_tabs — 列出全部运行时 tab
wp_tabs() { wp_exec "0" "tabs" 5; }

# wp_newtab [URL] — 新建浏览器 tab，返回新 tab id
wp_newtab() {
    local result
    if [ -n "${1:-}" ]; then
        result=$(wp_exec "0" "tab_new $1" 5)
    else
        result=$(wp_exec "0" "tab_new" 5)
    fi
    if echo "$result" | grep -q "^ok: created tab "; then
        echo "${result##* }"
    else
        echo "$result"
    fi
}

# 兼容旧名字
wp_tab_new() { wp_newtab "$@"; }

# wp_closetab TAB
wp_closetab() { wp_exec "0" "tab_close $1" 5; }

# 兼容旧名字
wp_tab_close() { wp_closetab "$@"; }

# wp_switchtab TAB
wp_switchtab() { wp_exec "0" "tab $1" 5; }

# wp_goto_tab TAB URL — 定向导航指定 tab
wp_goto_tab() { wp_exec "$1" "goto $1 $2" 5; }

# wp_back [TAB]
wp_back() {
    if [ -n "${1:-}" ]; then
        wp_exec "$1" "back $1" 5
    else
        wp_exec "0" "back" 5
    fi
}

# wp_forward [TAB]
wp_forward() {
    if [ -n "${1:-}" ]; then
        wp_exec "$1" "forward $1" 5
    else
        wp_exec "0" "forward" 5
    fi
}

# wp_restart — 编译 + 重启 AutoMedia（保留 URL，恢复 session）
wp_restart() {
    info "build..."
    (cd "$AUTOMEDIA_BASE" && cargo build --release 2>&1 | tail -1)
    info "copy binary..."
    cp "$AUTOMEDIA_BASE/target/release/automedia" "$AUTOMEDIA_BASE/AutoMedia.app/Contents/MacOS/automedia"
    info "restart (URL auto-restore)..."
    kill "$(pgrep -f automedia)" 2>/dev/null
    sleep 2
    open "$AUTOMEDIA_BASE/AutoMedia.app"
    sleep 5
    ok "AutoMedia restarted"
}

# ── 通用编辑器操作 ──

# wp_focus TAB — native click 聚焦 contenteditable 编辑器
wp_focus() {
    wp_clickel "$1" "[contenteditable=true]"
}

# wp_clear TAB — 清空编辑器（native: click + Cmd+A + Delete）
wp_clear() {
    wp_clickel "$1" "[contenteditable=true]"
    sleep 0.3
    wp_key "$1" "cmd+a"
    sleep 0.3
    wp_key "$1" "backspace"
}

# wp_login_check TAB — 检查是否在登录页
wp_login_check() {
    wp_js "$1" '(function(){var h=window.location.href;if(h.indexOf("login")>=0||h.indexOf("passport")>=0||document.querySelector("[class*=qrcode]"))return "LOGIN_PAGE";return "LOGGED_IN: "+h.substring(0,60);})()'
}

# ── 离线数据采集（零注入） ──
# 所有数据提取通过下载 → 离线解析，不在页面内执行提取逻辑

# wp_text TAB — 下载纯文本到 /tmp/wp-text-{TAB}.txt（轻量，适合大多数平台）
wp_text() { wp_exec "$1" "text" 10; }

# wp_text_shadow TAB — 下载纯文本 + Shadow DOM（视频号用）
wp_text_shadow() { wp_exec "$1" "text_shadow" 10; }

# wp_html_page TAB — 下载完整 HTML 到 /tmp/wp-html-{TAB}.html（需要 CSS class 解析时用）
wp_html_page() { wp_exec "$1" "html" 10; }

# wp_html TAB [SELECTOR] — 不带 selector 时下载完整页面；带 selector 时返回元素 innerHTML
wp_html() {
    if [ $# -ge 2 ]; then
        local result
        result=$(wp_exec "$1" "htmlel \"$2\"" "${3:-10}")
        echo "${result#ok: }"
    else
        wp_html_page "$1"
    fi
}

# wp_html_shadow TAB — 下载 HTML + Shadow DOM
wp_html_shadow() { wp_exec "$1" "html_shadow" 10; }

# 路径
wp_text_path() { echo "/tmp/wp-text-$1.txt"; }
wp_html_path() { echo "/tmp/wp-html-$1.html"; }

# ── 活动日志 ──

# wp_log TYPE PLATFORM DETAILS — 追加到活动日志（永不覆盖）
wp_log() { wp_exec "0" "log $1:$2:${3:-}" 3; }

# wp_stats [N] — 读最近 N 条活动日志
wp_stats() { wp_exec "0" "stats ${1:-20}" 5; }

# ── 输出 ──

ok()   { echo "✓ $*"; }
fail() { echo "✗ $*" >&2; exit 1; }
info() { echo "… $*"; }

# wp_inputel TAB "selector" "text" — find element, native click for focus, paste text
wp_inputel() { wp_exec "$1" "inputel \"$2\" $3" "${4:-15}"; }

# wp_dismiss TAB "word1,word2,word3" — native click ALL elements matching any word (dismiss popups)
wp_dismiss() { wp_exec "$1" "dismiss $2" 5; }

# wp_jsclick TAB "js_returning_x,y" — JS 定位元素坐标 + native click
# JS 必须返回 "数字,数字" 格式的坐标。用于复杂 DOM 查找（Shadow DOM、indexed元素等）。
# JS 只负责定位，点击是 isTrusted:true 的原生事件。
wp_jsclick() {
    local tab="$1" js="$2"
    local result
    result=$(wp_js "$tab" "$js" 5)
    local coords
    coords=$(echo "$result" | grep -oE '[0-9]+,[0-9]+' | head -1)
    if [ -n "$coords" ]; then
        local x y
        x=$(echo "$coords" | cut -d, -f1)
        y=$(echo "$coords" | cut -d, -f2)
        wp_click "$tab" "$x" "$y"
    else
        echo "error: no coords from JS ($result)"
    fi
}

# wp_scrollel TAB "selector" — scroll element into view (smooth, center)
wp_scrollel() { wp_exec "$1" "scrollel $2" 5; }

# wp_readel TAB "selector" — read element's text content
wp_readel() { wp_exec "$1" "readel $2" 5; }

# wp_exists TAB "selector" — whether the element exists
wp_exists() {
    local result
    result=$(wp_exec "$1" "exists \"$2\"" 5)
    echo "${result#ok: }"
}

# wp_visible TAB "selector" — whether the element is visible in viewport
wp_visible() {
    local result
    result=$(wp_exec "$1" "visible \"$2\"" 5)
    echo "${result#ok: }"
}

# wp_attr TAB "selector" ATTR — read attribute value
wp_attr() {
    local result
    result=$(wp_exec "$1" "attr \"$2\" $3" 5)
    echo "${result#ok: }"
}

# wp_count TAB "selector" — count matching elements
wp_count() {
    local result
    result=$(wp_exec "$1" "count \"$2\"" 5)
    echo "${result#ok: }"
}

# wp_waitel TAB "selector" [timeout_ms] — wait for element to appear
wp_waitel() {
    local tab="$1" selector="$2" timeout_ms="${3:-5000}"
    local exec_timeout_s=$(( (timeout_ms + 999) / 1000 + 5 ))
    local result
    result=$(wp_exec "$tab" "wait \"$selector\" $timeout_ms" "$exec_timeout_s")
    echo "${result#ok: }"
}

# wp_url TAB — current page URL
wp_url() {
    local result
    result=$(wp_exec "$1" "url" 5)
    echo "${result#ok: }"
}

# wp_title TAB — current page title
wp_title() {
    local result
    result=$(wp_exec "$1" "title" 5)
    echo "${result#ok: }"
}

# wp_focusel TAB "selector" — native click for real focus, no input
wp_focusel() { wp_exec "$1" "focusel $2" "${3:-10}"; }

# wp_jsclick TAB "js_returning_coords" — evaluate JS to get x,y then native click
# Used when element needs custom JS to locate (e.g. Shadow DOM traversal)
wp_jsclick() {
    local tab="$1" js="$2"
    local coords
    coords=$(wp_js "$tab" "$js" 10)
    coords="${coords#ok: }"
    if echo "$coords" | grep -qE '^[0-9]+,[0-9]+$'; then
        local x y
        x=$(echo "$coords" | cut -d, -f1)
        y=$(echo "$coords" | cut -d, -f2)
        wp_click "$tab" "$x" "$y"
    else
        echo "error: $coords"
    fi
}
