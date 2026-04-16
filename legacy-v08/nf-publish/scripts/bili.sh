#!/bin/bash
# B站原子动作 — tab 2
# 用法: scripts/bili.sh <action> [args...]
#
# 动作列表:
#   open                    打开上传页
#   upload <video_path>     上传视频
#   dismiss                 关弹窗（通知/批量操作）
#   title <text>            填标题（≤80字）
#   desc <text>             填描述
#   tag <text>              添加一个标签（Enter确认）
#   submit                  立即投稿
#   check                   检查是否投稿成功
#   screenshot              截图

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB="${BILI_TAB:-2}"

case "${1:-help}" in

open)
    info "打开B站上传页"
    wp_goto $TAB "https://member.bilibili.com/platform/upload/video/frame"
    ;;

upload)
    [ -z "${2:-}" ] && fail "用法: bili.sh upload <video_path>"
    info "上传视频: $2"
    wp_upload $TAB "$2"
    ;;

dismiss)
    info "关弹窗"
    # 关"知道了"/"禁止"/"暂不设置"/"取消"/"不用了"
    wp_dismiss $TAB "知道了,禁止,暂不设置,取消,不用了"
    ;;

title)
    [ -z "${2:-}" ] && fail "用法: bili.sh title <text>"
    local_title="$2"
    info "填标题: $local_title"
    wp_inputel $TAB 'input[placeholder*="稿件标题"]' "$local_title"
    ;;

desc)
    [ -z "${2:-}" ] && fail "用法: bili.sh desc <text>"
    info "填描述"
    wp_inputel $TAB "[contenteditable=true]" "$2"
    ;;

tag)
    [ -z "${2:-}" ] && fail "用法: bili.sh tag <text>"
    local_tag="$2"
    info "添加标签: $local_tag"
    # 聚焦标签 input → type → enter
    wp_clickel $TAB "input[placeholder*=\"按回车键\"]"
    sleep 0.5
    wp_type $TAB "$local_tag"
    sleep 1
    wp_key $TAB "enter"
    ;;

submit)
    info "submit"
    wp_clickel $TAB "text:立即投稿"
    ;;

check)
    info "检查投稿结果"
    wp_js $TAB '(function(){return document.body.innerText.indexOf("稿件投递成功")>=0?"SUCCESS":"PENDING";})()'
    ;;

login_check)
    wp_login_check $TAB
    ;;

clear)
    info "clear editor"
    wp_clear $TAB
    ;;

wait_upload)
    info "wait for upload"
    wp_wait $TAB '(function(){if(document.body.innerText.indexOf("更换视频")>=0||document.body.innerText.indexOf("上传完成")>=0)return "COMPLETE";return null;})()' 60 3
    ;;

screenshot)
    wp_screenshot $TAB
    ;;

*)
    echo "B站原子动作 (tab $TAB)"
    echo "用法: bili.sh <action> [args...]"
    echo ""
    echo "动作:"
    echo "  open                 打开上传页"
    echo "  upload <path>        上传视频"
    echo "  dismiss              关弹窗"
    echo "  title <text>         填标题"
    echo "  desc <text>          填描述"
    echo "  tag <text>           添加标签"
    echo "  submit               投稿"
    echo "  check                检查结果"
    echo "  screenshot           截图"
    ;;
esac
