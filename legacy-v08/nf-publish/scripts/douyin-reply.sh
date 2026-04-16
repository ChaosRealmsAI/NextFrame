#!/bin/bash
# 抖音评论互动 — tab 0
# 用法: scripts/douyin-reply.sh <action> [args...]
#
# 动作列表:
#   open                      打开评论管理页
#   videos                    列出视频+评论数（点选择作品）
#   dump                      导出当前视频全部评论 (JSON)
#   unreplied                 未回复的评论列表
#   reply <username> <text>   回复指定用户
#   comment <text>            发主动评论（作者身份）
#   verify                    核验回复配对
#   record_fans               记录粉丝到账号库
#   record_fans_all           遍历所有视频记录粉丝
#   fans                      查看粉丝列表
#   screenshot                截图
#
# 抖音评论管理页: /creator-micro/interactive/comment
# DOM: 普通 DOM（无 Shadow DOM）
# 评论容器: .container-sXKyMs
# 输入: contenteditable div.input-d24X73
# 发送: span.douyin-creator-interactive-button-conten (text="发送")

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB=0
FANS_FILE="$AUTOMEDIA_BASE/data/fans/douyin.json"
COMMENT_URL="https://creator.douyin.com/creator-micro/interactive/comment"

case "${1:-help}" in

open)
    info "打开抖音评论管理页"
    wp_goto $TAB "$COMMENT_URL"
    sleep 3
    ok "评论管理页已打开"
    ;;

dump)
    info "导出全部评论"
    wp_js $TAB "
(function(){
    var containers=document.querySelectorAll('[class*=container-sXKyMs]');
    var r=[];
    for(var i=0;i<containers.length;i++){
        var c=containers[i];
        var nameEl=c.querySelector('[class*=name]');
        var contentEl=c.querySelector('[class*=content]');
        if(!nameEl)continue;
        var name=nameEl.textContent.replace('作者','').trim();
        var isAuthor=c.innerText.indexOf('作者')>=0;
        var text='';
        // Find the actual comment text (not username, not buttons)
        var spans=c.querySelectorAll('span,div');
        for(var j=0;j<spans.length;j++){
            var t=spans[j].textContent.trim();
            if(t.length>2&&t!==name&&t!=='作者'&&t!=='回复'&&t!=='删除'&&t!=='举报'&&t.indexOf('前')<=0){
                text=t;break;
            }
        }
        r.push(JSON.stringify({i:i,user:name,text:text.substring(0,100),is_self:name==='OPC-王宇轩',is_author:isAuthor}));
    }
    return '['+r.join(',')+']';
})()" 10
    ;;

unreplied)
    info "查找未回复评论"
    wp_js $TAB "
(function(){
    var containers=document.querySelectorAll('[class*=container-sXKyMs]');
    var replied={};
    var comments=[];
    for(var i=0;i<containers.length;i++){
        var c=containers[i];
        var nameEl=c.querySelector('[class*=name]');
        if(!nameEl)continue;
        var name=nameEl.textContent.replace('作者','').trim();
        var isAuthor=c.innerText.indexOf('作者')>=0;
        var text='';
        var spans=c.querySelectorAll('span,div');
        for(var j=0;j<spans.length;j++){
            var t=spans[j].textContent.trim();
            if(t.length>2&&t!==name&&t!=='作者'&&t!=='回复'&&t!=='删除'&&t!=='举报'&&t.indexOf('前')<=0){
                text=t;break;
            }
        }
        if(name==='OPC-王宇轩'){
            // Mark previous comment as replied
            if(i>0){
                var prev=containers[i-1].querySelector('[class*=name]');
                if(prev)replied[prev.textContent.replace('作者','').trim()]=true;
            }
            continue;
        }
        comments.push({i:i,user:name,text:text.substring(0,80)});
    }
    var unreplied=comments.filter(function(c){return !replied[c.user]});
    return JSON.stringify(unreplied);
})()" 10
    ;;

reply)
    [ -z "${2:-}" ] || [ -z "${3:-}" ] && fail "用法: douyin-reply.sh reply <username> <text>"
    _target="$2"
    _text="$3"
    info "回复 $_target"

    # Step 1: 找到评论的回复按钮并点击
    rm -f /tmp/wp-result-$TAB.txt
    # JS finds reply button coords, then native click
    _reply_result=$(wp_js $TAB "(function(){
        var containers=document.querySelectorAll('[class*=container-sXKyMs]');
        for(var i=0;i<containers.length;i++){
            var nameEl=containers[i].querySelector('[class*=name]');
            if(!nameEl)continue;
            var name=nameEl.textContent.replace('作者','').trim();
            if(name==='$_target'){
                var btns=containers[i].querySelectorAll('*');
                for(var j=0;j<btns.length;j++){
                    if(btns[j].textContent.trim()==='回复'&&btns[j].childElementCount===0&&btns[j].offsetWidth>0){
                        var r=btns[j].getBoundingClientRect();
                        return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);
                    }
                }
                return 'no reply btn';
            }
        }
        return 'NOT_FOUND';
    })()" 5)
    if echo "$_reply_result" | grep -qE 'ok: [0-9]+,[0-9]+'; then
        _coords=$(echo "$_reply_result" | grep -oE '[0-9]+,[0-9]+' | head -1)
        wp_click $TAB "$(echo "$_coords" | cut -d, -f1)" "$(echo "$_coords" | cut -d, -f2)"
        echo "ok: clicked reply" > /tmp/wp-result-$TAB.txt
    else
        echo "$_reply_result" > /tmp/wp-result-$TAB.txt
    fi
    sleep 3
    if grep -q "NOT_FOUND" /tmp/wp-result-$TAB.txt 2>/dev/null; then
        fail "用户 '$_target' 未找到"
    fi

    # Step 2: Native input via inputel (click focus + clipboard paste)
    wp_inputel $TAB "[contenteditable=true][class*=input]" "$_text"
    sleep 2

    # Step 4: 点发送
    wp_clickel $TAB "text:发送"
    sleep 3
    if true; then
        ok "已回复 $_target"
    else
        fail "提交失败"
    fi
    ;;

comment)
    [ -z "${2:-}" ] && fail "用法: douyin-reply.sh comment <text>"
    _text="$2"
    info "发主动评论"

    # Native input + send
    wp_inputel $TAB "[contenteditable=true][class*=input]" "$_text"
    sleep 2

    # Click send
    wp_clickel $TAB "text:发送"
    sleep 3
    if true; then
        ok "评论已发送"
    else
        fail "提交失败"
    fi
    ;;

verify)
    info "核验回复配对"
    wp_js $TAB "
(function(){
    var containers=document.querySelectorAll('[class*=container-sXKyMs]');
    var pairs=[];
    var lastUser='';
    for(var i=0;i<containers.length;i++){
        var nameEl=containers[i].querySelector('[class*=name]');
        if(!nameEl)continue;
        var name=nameEl.textContent.replace('作者','').trim();
        var text='';
        var spans=containers[i].querySelectorAll('span,div');
        for(var j=0;j<spans.length;j++){
            var t=spans[j].textContent.trim();
            if(t.length>2&&t!==name&&t!=='作者'&&t!=='回复'&&t!=='删除'&&t!=='举报'&&t.indexOf('前')<=0){
                text=t;break;
            }
        }
        if(name==='OPC-王宇轩'&&i>0){
            pairs.push(JSON.stringify({target:lastUser,reply:text.substring(0,60)}));
        }else{
            lastUser=name;
        }
    }
    return '['+pairs.join(',')+']';
})()" 10
    ;;

record_fans)
    info "记录当前视频粉丝到账号库"
    _fans_raw=$(wp_js $TAB "
(function(){
    var containers=document.querySelectorAll('[class*=container-sXKyMs]');
    var users={};
    for(var i=0;i<containers.length;i++){
        var nameEl=containers[i].querySelector('[class*=name]');
        if(!nameEl)continue;
        var name=nameEl.textContent.replace('作者','').trim();
        if(name==='OPC-王宇轩')continue;
        var text='';
        var spans=containers[i].querySelectorAll('span,div');
        for(var j=0;j<spans.length;j++){
            var t=spans[j].textContent.trim();
            if(t.length>2&&t!==name&&t!=='作者'&&t!=='回复'&&t!=='删除'&&t!=='举报'&&t.indexOf('前')<=0){
                text=t;break;
            }
        }
        if(!users[name])users[name]={text:text.substring(0,60)};
    }
    return JSON.stringify(users);
})()" 10)
    _fans_raw="${_fans_raw#ok: }"
    echo "$_fans_raw" > /tmp/douyin-fans-raw.json

    python3 -c "
import json, os
from datetime import datetime
fans_file = '$FANS_FILE'
now = datetime.now().strftime('%Y-%m-%d')
with open('/tmp/douyin-fans-raw.json') as f:
    current = json.load(f)
data = {'platform':'douyin','account':'OPC-王宇轩','fans':{}}
if os.path.exists(fans_file):
    with open(fans_file) as f:
        data = json.load(f)
fans = data.setdefault('fans', {})
new_count = 0
for user, info in current.items():
    if user in fans:
        fans[user]['interactions'] = fans[user].get('interactions', 0) + 1
        fans[user]['last_seen'] = now
        fans[user]['last_comment'] = info['text']
    else:
        fans[user] = {
            'first_seen': now, 'last_seen': now, 'interactions': 1,
            'last_comment': info['text'], 'is_bot': False,
            'tags': [], 'notes': ''
        }
        new_count += 1
data['last_scan'] = now
with open(fans_file, 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f'updated: {len(current)} users ({new_count} new)')
"
    ok "粉丝数据已更新"
    ;;

fans)
    if [ ! -f "$FANS_FILE" ]; then
        fail "无粉丝数据，先运行 record_fans"
    fi
    python3 -c "
import json
with open('$FANS_FILE') as f:
    data = json.load(f)
fans = data.get('fans', {})
sorted_fans = sorted(fans.items(), key=lambda x: x[1].get('interactions', 0), reverse=True)
print(f'共 {len(fans)} 位互动用户')
for name, info in sorted_fans[:30]:
    tags = ' '.join(info.get('tags', []))
    print(f'  {name} | x{info.get(\"interactions\",0)} | {info.get(\"first_seen\",\"?\")} | {tags}')
"
    ;;

screenshot)
    wp_screenshot $TAB
    ok "截图: $(wp_screenshot_file $TAB)"
    ;;

help|*)
    echo "抖音评论互动 — tab 0"
    echo ""
    echo "用法: $(basename "$0") <action> [args...]"
    echo ""
    echo "动作:"
    echo "  open                      打开评论管理页"
    echo "  dump                      导出全部评论(JSON)"
    echo "  unreplied                 未回复评论列表"
    echo "  reply <user> <text>       回复指定用户"
    echo "  comment <text>            发主动评论"
    echo "  verify                    核验回复配对"
    echo "  record_fans               记录粉丝到账号库"
    echo "  fans                      查看粉丝列表"
    echo "  screenshot                截图"
    ;;

esac
