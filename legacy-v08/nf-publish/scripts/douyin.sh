#!/bin/bash
# 抖音原子动作 — tab 0
# 用法: scripts/douyin.sh <action> [args...]
#
# 动作列表:
#   pad <video_path>          视频 pad 到 9:19.5 (1080x2340)，输出 /tmp/video-padded.mp4
#   open                      打开上传页
#   upload [path]             上传视频（默认 /tmp/video-padded.mp4）
#   wait_page                 轮询等跳转到发布页
#   dismiss                   关弹窗（完成/我知道了）
#   title <text>              填标题（≤30字）
#   desc <text>               填描述（native paste）
#   tag <text>                添加一个话题标签（逐字输入，蓝色识别）
#   wait_upload               等上传完成（轮询"重新上传"）
#   cover                     智能推荐封面
#   publish                   点发布
#   check                     检查是否发布成功
#   screenshot                截图
#
# 核心规则：
#   1. 话题标签必须在空编辑器上先加，再加正文
#   2. 写错了不要清空重试，回上传页重新上传拿新鲜发布页
#   3. 每次发布必须从 open → upload → wait_page 开始

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# TAB 可通过环境变量覆盖（默认 0 = 抖音 workspace tab）
TAB="${DOUYIN_TAB:-0}"

case "${1:-help}" in

pad)
    [ -z "${2:-}" ] && fail "用法: douyin.sh pad <video_path>"
    local_video="$2"
    info "视频 pad 到 1080x2340 (9:19.5)"
    BG=$(ffmpeg -y -ss 5 -i "$local_video" -vframes 1 -vf "crop=10:10:0:0" \
      -f rawvideo -pix_fmt rgb24 pipe: 2>/dev/null | xxd -l 3 -p)
    ffmpeg -y -i "$local_video" -vf "pad=1080:2340:0:210:0x${BG}" \
      -c:v libx264 -crf 18 -preset fast -c:a copy /tmp/video-padded.mp4 2>&1 | tail -1
    ok "输出: /tmp/video-padded.mp4"
    ;;

open)
    info "打开抖音上传页"
    # JS 导航比 goto 更可靠（workspace tab 的 goto 有时不跳转）
    wp_js $TAB '(function(){window.location.href="https://creator.douyin.com/creator-micro/content/upload";return "navigating";})()'
    sleep 3
    ;;

upload)
    local_file="${2:-/tmp/video-padded.mp4}"
    info "上传视频: $local_file"
    wp_upload $TAB "$local_file"
    ;;

wait_page)
    info "等待跳转到发布页"
    wp_wait $TAB '(function(){var h=window.location.href;if(h.indexOf("content/post/video")>=0||h.indexOf("content/publish")>=0)return "PUBLISH_PAGE";return null;})()' 30 2
    ;;

dismiss)
    info "关弹窗"
    wp_dismiss $TAB "完成,我知道了"
    ;;

title)
    [ -z "${2:-}" ] && fail "用法: douyin.sh title <text>"
    local_title="$2"
    info "填标题: $local_title"
    wp_inputel $TAB 'input[placeholder*="标题"], textarea[placeholder*="标题"]' "$local_title"
    ;;

desc)
    [ -z "${2:-}" ] && fail "用法: douyin.sh desc <text>  (支持多行，在话题后追加)"
    info "desc via native paste"
    # movetoend 到标签后面，回车换行，然后 inputel 粘贴
    wp_exec $TAB "movetoend" 3
    sleep 0.5
    wp_key $TAB "enter"
    sleep 0.5
    wp_inputel $TAB "[contenteditable=true]" "$2"
    sleep 2
    ;;

tag)
    [ -z "${2:-}" ] && fail "用法: douyin.sh tag <text>"
    local_tag="$2"
    info "tag: #$local_tag (max 5)"

    # Step 1: movetoend — 光标到末尾（确保 # 插在最后）
    wp_exec $TAB "movetoend" 3
    sleep 0.5

    # Step 2: 点"#添加话题"按钮（# 插在光标处 = 末尾，光标自动在 # 后）
    wp_clickel $TAB "text:#添加话题"
    sleep 2

    # Step 3: 逐字 type — 每字前 key end 确保光标留在 mention 节点内
    for ch in $(echo "$local_tag" | grep -o .); do
        wp_key $TAB "end"
        sleep 0.3
        wp_type $TAB "$ch"
        sleep 0.8
    done

    # Step 4: 空格确认 → 变蓝
    sleep 0.5
    wp_key $TAB "space"

    # Step 5: 验证蓝标签数量
    sleep 2
    wp_js $TAB '(function(){var ed=document.querySelector("[contenteditable=true]");if(!ed)return "no";var blues=ed.querySelectorAll("[data-mention]");return "blue:"+blues.length;})()'
    ;;

wait_upload)
    info "等上传完成"
    wp_wait $TAB '(function(){if(document.body.innerText.indexOf("重新上传")>=0)return "COMPLETE";return null;})()' 90 3
    ;;

cover)
    info "设封面（智能推荐）"
    # 点"智能推荐封面"
    wp_clickel $TAB "text:智能推荐封面"
    sleep 4
    # 选第一个推荐封面（JS 只定位，点击走原生事件）
    wp_jsclick $TAB '(function(){var c=document.querySelectorAll("[class*=recommendCover],[class*=cover-item]");if(c.length>0){var r=c[0].getBoundingClientRect();return Math.round(r.x+r.width/2)+","+Math.round(r.y+r.height/2)}return "no covers";})()'
    sleep 3
    # 确认弹窗（可能需要点多次，有的版本有两层确认）
    for i in 1 2; do
        wp_jsclick $TAB '(function(){var b=document.querySelectorAll("button");for(var i=b.length-1;i>=0;i--){if(b[i].textContent.trim()==="确定"&&b[i].offsetWidth>0&&b[i].offsetHeight<60){var r=b[i].getBoundingClientRect();return Math.round(r.x+r.width/2)+","+Math.round(r.y+r.height/2)}}return "no confirm";})()'
        sleep 2
    done
    ;;

publish)
    info "点发布"
    wp_clickel $TAB "text:发布"
    ;;

check)
    info "检查发布结果"
    wp_js $TAB '(function(){var h=window.location.href;if(h.indexOf("content/manage")>=0)return "SUCCESS";return "PENDING: "+h;})()'
    ;;

login_check)
    wp_login_check $TAB
    ;;

clear)
    info "clear editor"
    wp_clear $TAB
    ;;

screenshot)
    wp_screenshot $TAB
    ;;

*)
    echo "抖音原子动作 (tab $TAB)"
    echo "用法: douyin.sh <action> [args...]"
    echo ""
    echo "动作:"
    echo "  pad <video>            视频 pad 到 9:19.5"
    echo "  open                   打开上传页"
    echo "  upload [path]          上传视频"
    echo "  wait_page              等跳转到发布页"
    echo "  dismiss                关弹窗"
    echo "  title <text>           填标题"
    echo "  desc <text>            填描述"
    echo "  tag <text>             添加话题标签（逐字）"
    echo "  wait_upload            等上传完成"
    echo "  cover                  智能推荐封面"
    echo "  publish                发布"
    echo "  check                  检查结果"
    echo "  screenshot             截图"
    echo ""
    echo "典型流程："
    echo "  douyin.sh pad video.mp4"
    echo "  douyin.sh open"
    echo "  douyin.sh upload"
    echo "  douyin.sh wait_page"
    echo "  douyin.sh dismiss"
    echo "  douyin.sh tag 程序员       # 先加标签（空编辑器上）"
    echo "  douyin.sh tag AI编程"
    echo "  douyin.sh desc '描述内容'  # 再加正文"
    echo "  douyin.sh title '标题'"
    echo "  douyin.sh wait_upload"
    echo "  douyin.sh cover"
    echo "  douyin.sh publish"
    echo "  douyin.sh check"
    ;;
esac
