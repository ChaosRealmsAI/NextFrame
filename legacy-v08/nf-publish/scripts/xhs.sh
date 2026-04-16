#!/bin/bash
# 小红书原子动作 — tab 1
# 用法: scripts/xhs.sh <action> [args...]
#
# 动作列表:
#   open                    打开上传页
#   upload <video_path>     上传视频
#   title <text>            填标题（≤20字）
#   desc <text>             填描述（支持 \n 换行）
#   topic <keyword>         添加一个话题（从下拉框选）
#   publish                 点发布
#   check                   检查是否发布成功
#   screenshot              截图

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB="${XHS_TAB:-1}"

case "${1:-help}" in

open)
    info "打开小红书上传页"
    wp_goto $TAB "https://creator.xiaohongshu.com/publish/publish?source=official"
    ;;

upload)
    [ -z "${2:-}" ] && fail "用法: xhs.sh upload <video_path>"
    info "上传视频: $2"
    wp_upload $TAB "$2"
    ;;

title)
    [ -z "${2:-}" ] && fail "用法: xhs.sh title <text>"
    local_title="$2"
    info "填标题: $local_title"
    wp_inputel $TAB 'input[placeholder*="标题"]' "$local_title"
    ;;

desc)
    [ -z "${2:-}" ] && fail "用法: xhs.sh desc <text>"
    info "desc via native paste"
    wp_inputel $TAB ".tiptap.ProseMirror" "$2"
    ;;

topic)
    [ -z "${2:-}" ] && fail "用法: xhs.sh topic <keyword>"
    keyword="$2"
    info "添加话题: $keyword"
    # Step 1: 点话题按钮（native click）
    wp_clickel $TAB "button.topic-btn"
    sleep 1
    # Step 2: 输入关键词（native type）
    wp_type $TAB "$keyword"
    sleep 2
    # Step 3: 轮询下拉框，找到匹配项，native click
    for _try in $(seq 1 10); do
        _topic_coords=$(wp_js $TAB "(function(){var items=document.querySelectorAll('div.item');for(var i=0;i<items.length;i++){if(items[i].textContent.indexOf('#')>=0&&items[i].textContent.indexOf('$keyword')>=0&&items[i].offsetWidth>0){var r=items[i].getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2)}}return 'waiting'})()" 3)
        if echo "$_topic_coords" | grep -qE 'ok: [0-9]+,[0-9]+'; then
            _x=$(echo "$_topic_coords" | grep -oE '[0-9]+,[0-9]+' | cut -d, -f1)
            _y=$(echo "$_topic_coords" | grep -oE '[0-9]+,[0-9]+' | cut -d, -f2)
            wp_click $TAB "$_x" "$_y"
            ok "话题 #$keyword 已选"
            break
        fi
        sleep 1
    done
    ;;

publish)
    info "点发布"
    wp_clickel $TAB "text:发布"
    ;;

check)
    info "检查发布结果"
    wp_js $TAB '(function(){return document.querySelector("input[type=file]")?"SUCCESS:back_to_upload":"PENDING";})()'
    ;;

login_check)
    wp_login_check $TAB
    ;;

clear)
    info "clear editor"
    wp_clear $TAB
    ;;

dismiss)
    info "close popups"
    wp_dismiss $TAB "我知道了,关闭,取消"
    ;;

wait_upload)
    info "wait for upload"
    wp_wait $TAB '(function(){if(document.querySelector(".tiptap"))return "READY";return null;})()' 30 3
    ;;

screenshot)
    wp_screenshot $TAB
    ;;

*)
    echo "小红书原子动作 (tab $TAB)"
    echo "用法: xhs.sh <action> [args...]"
    echo ""
    echo "动作:"
    echo "  open                 打开上传页"
    echo "  upload <path>        上传视频"
    echo "  title <text>         填标题"
    echo "  desc <text>          填描述"
    echo "  topic <keyword>      添加话题"
    echo "  publish              发布"
    echo "  check                检查结果"
    echo "  screenshot           截图"
    ;;
esac
