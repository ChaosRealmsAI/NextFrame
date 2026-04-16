#!/bin/bash
# 公众号原子动作 — tab 4
# 用法: scripts/mp.sh <action> [args...]
#
# 动作列表:
#   open                       进入图文编辑器（保留 token）
#   dismiss                    关弹窗（小店推广/稍后再说）
#   title <text>               填标题（≤64字）
#   author <text>              填作者
#   body <html>                填正文（ProseMirror，HTML 格式）
#   body_text <text>           填纯文本正文（自动加 <p> 标签）
#   cover <image_path>         设封面图（上传+选择+裁剪）
#   publish                    点发表（弹扫码验证）
#   check                      检查发表结果
#   login_check                检查登录状态
#   clear                      清空正文
#   screenshot                 截图
#
# 关键：公众号用 token URL 认证，绝不用 goto，只用 JS window.location.href

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB=4

case "${1:-help}" in

open)
    info "open editor (keep token)"
    wp_js $TAB '(function(){var m=window.location.href.match(/token=(\d+)/);if(!m)return "no token";window.location.href="/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&type=10&lang=zh_CN&token="+m[1];return "ok";})()'
    ;;

dismiss)
    info "close popups"
    wp_dismiss $TAB "稍后再说,取消,我知道了"
    ;;

title)
    [ -z "${2:-}" ] && fail "usage: mp.sh title <text>"
    info "title: $2"
    # wp_inputel 对 textarea 超时，改用 JS valueSetter（实测稳定）
    local title_js
    title_js=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$2")
    wp_js $TAB "(function(){var ta=document.querySelector('textarea.js_title');if(!ta)return 'no textarea';var s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;s.call(ta,$title_js);ta.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" 10
    ;;

author)
    [ -z "${2:-}" ] && fail "usage: mp.sh author <text>"
    info "author: $2"
    # wp_inputel 对作者字段超时，改用 JS valueSetter（实测稳定）
    local author_js
    author_js=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$2")
    wp_js $TAB "(function(){var inputs=document.querySelectorAll('input,textarea');for(var i=0;i<inputs.length;i++){if((inputs[i].placeholder||'').indexOf('作者')>=0){var proto=inputs[i].tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(inputs[i],$author_js);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));return 'ok'}}return 'no author field'})()" 10
    ;;

body)
    [ -z "${2:-}" ] && fail "usage: mp.sh body <html>"
    info "body (HTML via native paste)"
    wp_inputel $TAB ".ProseMirror" "$2"
    ;;

body_text)
    [ -z "${2:-}" ] && fail "usage: mp.sh body_text <text>"
    info "body (plain text via native paste)"
    wp_inputel $TAB ".ProseMirror" "$2"
    ;;

cover)
    [ -z "${2:-}" ] && fail "usage: mp.sh cover <image_path>"
    info "cover: $2"
    # 2026-04 实测流程：点封面按钮 → 菜单 → 从图片库选择 → 上传 → 选中 → 下一步 → 裁剪确认

    # Step 1: 滚到封面设置区域
    wp_js $TAB '(function(){var el=document.querySelector(".setting-group__cover_area");if(el){el.scrollIntoView({behavior:"smooth",block:"center"});return "ok"}return "no cover area"})()' 5
    sleep 1

    # Step 2: 点封面添加按钮（弹出菜单）
    wp_clickel $TAB ".select-cover__btn"
    sleep 1

    # Step 3: 点"从图片库选择"
    wp_clickel $TAB "text:从图片库选择"
    sleep 2

    # Step 4: 在图片库弹窗里上传图片
    echo "$2" > "$(wp_upload_file $TAB)"
    wp_clickel $TAB "text:上传文件"
    sleep 4

    # Step 5: 选中第一张图（刚上传的，自动选中有绿框）
    # 如果没自动选中，点第一张
    wp_clickel $TAB ".weui-desktop-img-picker__item"
    sleep 1

    # Step 6: 下一步
    wp_clickel $TAB "text:下一步"
    sleep 2

    # Step 7: 确认裁剪
    wp_clickel $TAB "text:确认"
    ;;

publish)
    info "publish (needs QR scan)"
    # 2026-04 实测流程：点发表 → 设置弹窗（群发通知开关）→ 弹窗内发表 → 继续发表 → 扫码

    # Step 1: 点底栏"发表"按钮
    wp_clickel $TAB "button.mass_send"
    sleep 3

    # Step 2: 关闭群发通知（省配额，默认关）
    # 找第一个 switch 开关，如果是开的就点关
    wp_js $TAB '(function(){var sw=document.querySelectorAll("[class*=weui-desktop-switch]");if(sw.length>0){var s=sw[0];if(s.className.indexOf("weui-desktop-switch_on")>=0||s.className.indexOf("checked")>=0){var r=s.getBoundingClientRect();return "on:"+Math.round(r.left+r.width/2)+","+Math.round(r.top+r.height/2)}return "already_off"}return "no_switch"})()' 5
    # 如果返回 on:x,y 就点击关闭
    local switch_result
    switch_result=$(cat /tmp/wp-result-$TAB.txt 2>/dev/null)
    if echo "$switch_result" | grep -q "^ok: on:"; then
        local coords
        coords=$(echo "$switch_result" | grep -oE '[0-9]+,[0-9]+')
        local sx sy
        sx=$(echo "$coords" | cut -d, -f1)
        sy=$(echo "$coords" | cut -d, -f2)
        wp_click $TAB "$sx" "$sy"
        sleep 1
    fi

    # Step 3: 点弹窗内的"发表"按钮（绿色 primary）
    wp_js $TAB '(function(){var ds=document.querySelectorAll("[class*=dialog],[class*=Dialog]");for(var j=0;j<ds.length;j++){var bs=ds[j].querySelectorAll("button");for(var k=0;k<bs.length;k++){if(bs[k].textContent.trim()==="发表"){var r=bs[k].getBoundingClientRect();return Math.round(r.left+r.width/2)+","+Math.round(r.top+r.height/2)}}}return "no_btn"})()' 5
    local pub_result
    pub_result=$(cat /tmp/wp-result-$TAB.txt 2>/dev/null)
    if echo "$pub_result" | grep -qE '^ok: [0-9]+,[0-9]+$'; then
        local pc
        pc=$(echo "$pub_result" | grep -oE '[0-9]+,[0-9]+')
        wp_click $TAB "$(echo "$pc" | cut -d, -f1)" "$(echo "$pc" | cut -d, -f2)"
        sleep 3
    fi

    # Step 4: 确认弹窗 → 继续发表
    wp_clickel $TAB "text:继续发表"
    sleep 2

    info "waiting for QR scan..."
    ;;

check)
    info "check publish status"
    wp_js $TAB '(function(){if(document.body.innerText.indexOf("发表成功")>=0||document.body.innerText.indexOf("已发表")>=0)return "SUCCESS";if(document.body.innerText.indexOf("扫码")>=0)return "NEED_QR_SCAN";return "PENDING";})()'
    ;;

login_check)
    wp_js $TAB '(function(){var h=window.location.href;if(h.indexOf("token=")>=0)return "LOGGED_IN: "+h.substring(0,60);return "LOGIN_PAGE";})()'
    ;;

clear)
    info "clear body"
    # Native: click editor for focus, select all, delete
    wp_clickel $TAB ".ProseMirror"
    sleep 0.3
    wp_key $TAB "cmd+a"
    sleep 0.3
    wp_key $TAB "backspace"
    ;;

screenshot)
    wp_screenshot $TAB
    ;;

*)
    echo "公众号原子动作 (tab $TAB)"
    echo "用法: mp.sh <action> [args...]"
    echo ""
    echo "动作:"
    echo "  open                  进入编辑器(保留token)"
    echo "  dismiss               关弹窗"
    echo "  title <text>          填标题"
    echo "  author <text>         填作者"
    echo "  body <html>           填正文(HTML)"
    echo "  body_text <text>      填正文(纯文本)"
    echo "  cover <image>         设封面图"
    echo "  publish               发表(需扫码)"
    echo "  check                 检查结果"
    echo "  login_check           检查登录"
    echo "  clear                 清空正文"
    echo "  screenshot            截图"
    echo ""
    echo "注意:"
    echo "  - 绝不用 goto 导航(丢 token)"
    echo "  - 群发每天 1 次，测试关群发通知"
    echo "  - 发表需微信扫码确认"
    ;;
esac
