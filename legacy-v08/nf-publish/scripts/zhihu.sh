#!/bin/bash
# 知乎原子动作 — tab 6
# 用法: scripts/zhihu.sh <action> [args...]
#
# 动作列表:
#   open                    打开视频上传页
#   upload <video_path>     上传视频
#   wait_upload             等待上传完成
#   title <text>            填标题
#   desc <text>             填详细介绍
#   submit                  发布视频
#   check                   检查是否发布成功
#   screenshot              截图
#
# 实测验证（2026-04-04）：
# - 上传页 URL: zhihu.com/zvideo/upload-video（通过 window.open 打开）
# - 标题: textarea[placeholder="标题"]（nativeValueSetter）
# - 描述: Draft.js contenteditable（native paste via inputel）
# - 视频类型: 默认"原创"
# - 发布: button "发布视频"（普通 click 即可）

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB=6

case "${1:-help}" in

open)
    info "打开知乎视频上传页"
    wp_goto $TAB "https://www.zhihu.com/zvideo/upload-video"
    ;;

upload)
    [ -z "${2:-}" ] && fail "用法: zhihu.sh upload <video_path>"
    info "上传视频: $2"
    wp_upload $TAB "$2"
    ;;

wait_upload)
    info "等待上传完成"
    wp_wait $TAB '(function(){var t=document.body.innerText;if(t.indexOf("替换视频")>=0||t.indexOf("封面")>=0)return "COMPLETE";return null;})()' 120 3
    ;;

title)
    [ -z "${2:-}" ] && fail "用法: zhihu.sh title <text>"
    info "填标题"
    wp_inputel $TAB 'textarea[placeholder="标题"]' "$2"
    ;;

desc)
    [ -z "${2:-}" ] && fail "用法: zhihu.sh desc <text>"
    info "填详细介绍"
    wp_inputel $TAB "[contenteditable=true]" "$2"
    ;;

submit)
    info "发布视频"
    wp_clickel $TAB "text:发布视频"
    ;;

check)
    info "检查发布结果"
    wp_js $TAB '(function(){var t=document.body.innerText;if(t.indexOf("发布成功")>=0)return "SUCCESS";if(t.indexOf("上传成功")>=0&&t.indexOf("发布成功")>=0)return "SUCCESS";return "PENDING";})()'
    ;;

login_check)
    wp_login_check $TAB
    ;;

screenshot)
    wp_screenshot $TAB
    ;;

*)
    echo "知乎原子动作 (tab $TAB)"
    echo "用法: zhihu.sh <action> [args...]"
    echo ""
    echo "动作:"
    echo "  open                 打开视频上传页"
    echo "  upload <path>        上传视频"
    echo "  wait_upload          等待上传完成"
    echo "  title <text>         填标题"
    echo "  desc <text>          填详细介绍"
    echo "  submit               发布视频"
    echo "  check                检查结果"
    echo "  screenshot           截图"
    ;;
esac
