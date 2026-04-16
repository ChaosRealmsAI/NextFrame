#!/bin/bash
# 快手原子动作 — tab 5
# 用法: scripts/kuaishou.sh <action> [args...]
#
# 动作列表:
#   open                    打开上传页
#   upload <video_path>     上传视频
#   wait_upload             等待上传完成
#   desc <text>             填描述（#话题 内联，最多4个话题）
#   dismiss                 关弹窗/引导
#   submit                  发布（滚到底 + PointerEvent）
#   check                   检查是否发布成功
#   screenshot              截图

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB=5

case "${1:-help}" in

open)
    info "打开快手上传页"
    wp_goto $TAB "https://cp.kuaishou.com/article/publish/video"
    ;;

upload)
    [ -z "${2:-}" ] && fail "用法: kuaishou.sh upload <video_path>"
    info "上传视频: $2"
    wp_upload $TAB "$2"
    ;;

wait_upload)
    info "等待上传完成"
    wp_wait $TAB '(function(){var t=document.body.innerText;if(t.indexOf("重新上传")>=0||t.indexOf("封面设置")>=0)return "COMPLETE";return null;})()' 120 3
    ;;

desc)
    [ -z "${2:-}" ] && fail "用法: kuaishou.sh desc <text>"
    info "填描述"
    # 描述和话题在同一个 contenteditable 字段
    # 话题上限4个！超过会发布失败
    wp_inputel $TAB "[contenteditable=true]" "$2"
    ;;

dismiss)
    info "关弹窗/引导"
    # 关掉发文助手引导、通知弹窗等
    wp_dismiss $TAB "知道了,关闭,跳过,忽略,×"
    ;;

submit)
    info "发布"
    # 1. 滚动到发布按钮
    wp_scrollel $TAB "main.el-main"
    sleep 1
    # 2. native click 发布按钮（isTrusted:true）
    wp_clickel $TAB "text:发布"
    ;;

check)
    info "检查发布结果"
    # 发布成功后页面跳转到视频管理（manage）
    wp_js $TAB '(function(){var h=window.location.href;if(h.indexOf("manage")>=0)return "SUCCESS";var t=document.body.innerText;if(t.indexOf("发布成功")>=0)return "SUCCESS";if(t.indexOf("发布失败")>=0)return "FAIL: "+t.substring(t.indexOf("发布失败"),t.indexOf("发布失败")+30);return "PENDING";})()'
    ;;

login_check)
    wp_login_check $TAB
    ;;

screenshot)
    wp_screenshot $TAB
    ;;

*)
    echo "快手原子动作 (tab $TAB)"
    echo "用法: kuaishou.sh <action> [args...]"
    echo ""
    echo "动作:"
    echo "  open                 打开上传页"
    echo "  upload <path>        上传视频"
    echo "  wait_upload          等待上传完成"
    echo "  desc <text>          填描述（#话题 内联，最多4个）"
    echo "  dismiss              关弹窗/引导"
    echo "  submit               发布"
    echo "  check                检查结果"
    echo "  screenshot           截图"
    ;;
esac
