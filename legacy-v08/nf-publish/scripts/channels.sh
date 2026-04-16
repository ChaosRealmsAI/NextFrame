#!/bin/bash
# 视频号原子动作 — tab 3
# 用法: scripts/channels.sh <action> [args...]
#
# 动作列表:
#   open                      打开发布页
#   upload <video_path>       上传视频（Shadow DOM）
#   desc <text>               填描述（含 #话题）
#   short_title <text>        填短标题（6-16字）
#   collection                添加推荐合集
#   publish                   点发表（需管理员扫码）
#   check                     检查发表结果
#   screenshot                截图
#
# 关键：视频号用 wujie 微前端，所有表单在 Shadow DOM 里
# var sr = document.querySelector('wujie-app').shadowRoot;

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB=3
SR='document.querySelector("wujie-app").shadowRoot'

case "${1:-help}" in

open)
    info "打开视频号发布页"
    wp_goto $TAB "https://channels.weixin.qq.com/platform/post/create"
    ;;

upload)
    [ -z "${2:-}" ] && fail "用法: channels.sh upload <video_path>"
    info "上传视频(Shadow DOM): $2"
    wp_upload_shadow $TAB "$2"
    ;;

stop_video)
    info "pause video playback"
    wp_js $TAB "(function(){var sr=$SR;if(!sr)return 'no';var vids=sr.querySelectorAll('video');var c=0;vids.forEach(function(v){if(!v.paused){v.pause();c++;}});return 'paused:'+c;})()"
    ;;

desc)
    [ -z "${2:-}" ] && fail "用法: channels.sh desc <text>"
    info "desc via native paste (shadow DOM)"
    wp_inputel $TAB ".input-editor" "$2"
    ;;

desc_paste)
    [ -z "${2:-}" ] && fail "用法: channels.sh desc_paste <text>"
    info "填描述(click+paste备选方案)"
    # 先获取编辑器坐标
    coords=
    coords=$(wp_js $TAB "$(cat <<JS
(function(){
    var sr = $SR;
    if(!sr) return "no shadow";
    var ed = sr.querySelector('.input-editor');
    if(!ed) return "no editor";
    var rect = ed.getBoundingClientRect();
    return Math.round(rect.x+rect.width/2)+","+Math.round(rect.y+10);
})()
JS
)")
    # 解析坐标
    x=""; y=""
    x=$(echo "$coords" | sed 's/ok: //' | cut -d, -f1)
    y=$(echo "$coords" | sed 's/ok: //' | cut -d, -f2)
    if [ -z "$x" ] || [ -z "$y" ]; then
        fail "无法获取编辑器坐标: $coords"
    fi
    wp_click $TAB "$x" "$y"
    sleep 1
    wp_paste $TAB "$2"
    ;;

short_title)
    [ -z "${2:-}" ] && fail "用法: channels.sh short_title <text> (6-16字)"
    local_title="$2"
    # 字数校验（中文算1字，英文字母也算1字）
    char_count=$(python3 -c "print(len('$local_title'))")
    if [ "$char_count" -gt 16 ]; then
        fail "short_title too long: $char_count chars (max 16). Got: $local_title"
    fi
    if [ "$char_count" -lt 6 ]; then
        fail "short_title too short: $char_count chars (min 6). Got: $local_title"
    fi
    info "short_title: $local_title ($char_count chars)"
    wp_inputel $TAB 'input[placeholder*="概括视频主要内容"]' "$local_title"
    ;;

collection)
    info "添加推荐合集"
    wp_jsclick $TAB "$(cat <<JS
(function(){
    var sr = $SR;
    if(!sr) return "no shadow";
    var links = sr.querySelectorAll("a, span");
    for(var i=0;i<links.length;i++){
        if(links[i].textContent.trim()==="添加" && links[i].offsetWidth>0 && links[i].offsetHeight<40){
            var r=links[i].getBoundingClientRect();
            return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);
        }
    }
    return "no collection add btn";
})()
JS
)"
    ;;

original)
    info "declare original (required)"
    # Step 1: 勾选"声明原创"复选框
    wp_jsclick $TAB "(function(){var sr=$SR;if(!sr)return 'no shadow';var cb=sr.querySelector('.declare-original-checkbox input[type=checkbox]');if(!cb){var cbs=sr.querySelectorAll('.ant-checkbox-wrapper input[type=checkbox]');for(var i=0;i<cbs.length;i++){var p=cbs[i].closest('label');if(p&&p.textContent.indexOf('原创')>=0){cb=cbs[i];break;}}}if(!cb)return 'no checkbox';if(cb.checked)return 'already checked';var r=cb.getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);})()"
    sleep 3
    # Step 2: 弹窗里勾选同意条款（第二个未选的 checkbox）
    wp_jsclick $TAB "(function(){var sr=$SR;if(!sr)return 'no';var cbs=sr.querySelectorAll('input[type=checkbox]');for(var i=0;i<cbs.length;i++){if(!cbs[i].checked){var r=cbs[i].getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);}}return 'all checked';})()"
    sleep 1
    # Step 3: 点"声明原创"确认按钮
    wp_jsclick $TAB "(function(){var sr=$SR;if(!sr)return 'no';var btns=sr.querySelectorAll('button');for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim()==='声明原创'&&btns[i].offsetWidth>0){var r=btns[i].getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);}}return 'no btn';})()"
    ;;

publish)
    info "publish (needs QR scan)"
    # 先检查发表按钮是否可点（灰色 = disabled 或有错误提示）
    # First check if button is disabled
    result=$(wp_js $TAB "(function(){var sr=$SR;if(!sr)return 'no shadow';var btns=sr.querySelectorAll('button');for(var i=0;i<btns.length;i++){if(btns[i].textContent.trim()==='发表'&&btns[i].offsetWidth>0){if(btns[i].disabled||btns[i].classList.contains('disabled')||getComputedStyle(btns[i]).opacity<0.5)return 'BLOCKED: publish btn is disabled (check title length / missing fields)';var r=btns[i].getBoundingClientRect();return 'COORDS:'+Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);}}return 'no publish btn';})()")
    if echo "$result" | grep -q "COORDS:"; then
        coords=$(echo "$result" | grep -oE '[0-9]+,[0-9]+' | head -1)
        x=$(echo "$coords" | cut -d, -f1); y=$(echo "$coords" | cut -d, -f2)
        wp_click $TAB "$x" "$y"
        result="ok: clicked"
    fi
    echo "$result"
    if echo "$result" | grep -q "BLOCKED"; then
        fail "Cannot publish — fix errors first"
    fi
    ;;

check)
    info "检查发表结果"
    wp_js $TAB '(function(){var sr=document.querySelector("wujie-app");if(!sr||!sr.shadowRoot)return "no shadow";var text=sr.shadowRoot.textContent;if(text.indexOf("发表成功")>=0)return "SUCCESS";if(text.indexOf("扫码")>=0)return "NEED_QR_SCAN";return "PENDING";})()'
    ;;

login_check)
    wp_login_check $TAB
    ;;

clear)
    info "clear editor (shadow DOM)"
    # Native: click editor, select all, delete
    wp_clickel $TAB ".input-editor"
    sleep 0.3
    wp_key $TAB "cmd+a"
    sleep 0.3
    wp_key $TAB "backspace"
    ;;

dismiss)
    info "close popups"
    wp_dismiss $TAB "我知道了,关闭,取消"
    ;;

wait_upload)
    info "wait for upload (shadow DOM)"
    wp_wait $TAB "(function(){var sr=$SR;if(!sr)return null;if(sr.textContent.indexOf('删除')>=0||sr.querySelector('video'))return 'COMPLETE';return null;})()" 60 3
    ;;

screenshot)
    wp_screenshot $TAB
    ;;

*)
    echo "视频号原子动作 (tab $TAB)"
    echo "用法: channels.sh <action> [args...]"
    echo ""
    echo "动作:"
    echo "  open                  打开发布页"
    echo "  upload <path>         上传视频"
    echo "  desc <text>           填描述（含#话题）"
    echo "  desc_paste <text>     填描述(备选click+paste)"
    echo "  short_title <text>    填短标题"
    echo "  collection            添加推荐合集"
    echo "  publish               发表"
    echo "  check                 检查结果"
    echo "  screenshot            截图"
    ;;
esac
