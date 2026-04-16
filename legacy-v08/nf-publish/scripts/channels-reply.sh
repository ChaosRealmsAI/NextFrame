#!/bin/bash
# 视频号评论互动 — tab 3
# 用法: scripts/channels-reply.sh <action> [args...]
#
# 动作列表:
#   open                      打开评论管理页
#   videos                    列出所有视频+评论数 (JSON)
#   select <index>            选中第N个视频
#   load_all                  滚动加载全部评论，返回总数
#   dump                      导出当前视频全部评论 (JSON，含回复链)
#   unreplied                 未回复的评论列表 (JSON)
#   reply <username> <text>   回复指定用户（paste方式，Vue兼容）
#   snapshot                  保存当前状态到快照文件
#   diff                      对比快照，输出增量评论
#   screenshot                截图
#
# 快照文件: data/comments/channels.json
# 关键：视频号用 wujie 微前端，评论管理页在 Shadow DOM 里

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

TAB=3
SR='document.querySelector("wujie-app").shadowRoot'
SNAPSHOT_FILE="$AUTOMEDIA_BASE/data/comments/channels.json"
FANS_FILE="$AUTOMEDIA_BASE/data/fans/channels.json"
COMMENT_URL="https://channels.weixin.qq.com/platform/interaction/comment?isImageMode=0"

# ── 评论管理页 ──

case "${1:-help}" in

open)
    info "打开评论管理页"
    wp_goto $TAB "$COMMENT_URL"
    sleep 3
    ok "评论管理页已打开"
    ;;

videos)
    info "获取视频列表"
    wp_js $TAB "(function(){var sr=$SR;var items=sr.querySelectorAll('.comment-feed-wrap');var r=[];for(var i=0;i<items.length;i++){var t=items[i].querySelector('.feed-title');var c=items[i].querySelector('.feed-comment-total');var tm=items[i].querySelector('.feed-time');r.push(JSON.stringify({index:i,title:t?t.textContent.trim().substring(0,60):'',comments:c?parseInt(c.textContent.trim()):0,time:tm?tm.textContent.trim():''}))}return '['+r.join(',')+']'})()" 5
    ;;

select)
    [ -z "${2:-}" ] && fail "用法: channels-reply.sh select <index>"
    info "选中视频 $2"
    wp_jsclick $TAB "(function(){var sr=$SR;var items=sr.querySelectorAll('.comment-feed-wrap');if($2>=items.length)return 'error: index out of range';var r=items[$2].getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);})()"
    sleep 2
    ;;

load_all)
    info "滚动加载全部评论"
    _prev_height=0
    _stable_count=0
    for i in $(seq 1 20); do
        _result=$(wp_js $TAB "(function(){var sr=$SR;var wrap=sr.querySelector('.feed-comment__wrp');if(!wrap)return 'no wrap';wrap.scrollTop=wrap.scrollHeight;return wrap.scrollHeight+':'+sr.querySelectorAll('.comment-item').length})()" 5)
        _cur_height=$(echo "$_result" | grep -o 'ok: [0-9]*' | grep -o '[0-9]*')
        if [ "$_cur_height" = "$_prev_height" ] 2>/dev/null; then
            _stable_count=$((_stable_count + 1))
            if [ "$_stable_count" -ge 2 ]; then
                break
            fi
        else
            _stable_count=0
        fi
        _prev_height="$_cur_height"
        sleep 2
    done
    # 获取最终数量
    wp_js $TAB "(function(){var sr=$SR;var items=sr.querySelectorAll('.comment-item');var users=0;for(var i=0;i<items.length;i++){var n=items[i].querySelector('.comment-user-name');if(n&&n.textContent.trim()!=='OPC-王宇轩')users++}return JSON.stringify({total:items.length,user_comments:users})})()" 5
    ;;

dump)
    info "导出全部评论"
    wp_js $TAB "
(function(){
    var sr=$SR;
    var items=sr.querySelectorAll('.comment-item');
    var r=[];
    for(var i=0;i<items.length;i++){
        var n=items[i].querySelector('.comment-user-name');
        var c=items[i].querySelector('.comment-content');
        var t=items[i].querySelector('.comment-time');
        if(!n||!c)continue;
        var u=n.textContent.trim();
        var txt=c.textContent.trim();
        r.push(JSON.stringify({
            i:i,
            user:u,
            text:txt.substring(0,100),
            time:t?t.textContent.trim():'',
            is_self:u==='OPC-王宇轩',
            is_bot:u==='元宝',
            is_reply:txt.indexOf('回复')===0
        }));
    }
    return '['+r.join(',')+']';
})()" 10
    ;;

unreplied)
    info "查找未回复评论"
    wp_js $TAB "
(function(){
    var sr=$SR;
    var items=sr.querySelectorAll('.comment-item');
    // 收集所有评论，标记哪些用户已被我们回复
    var all=[];
    var repliedUsers={};
    for(var i=0;i<items.length;i++){
        var n=items[i].querySelector('.comment-user-name');
        var c=items[i].querySelector('.comment-content');
        if(!n||!c)continue;
        var u=n.textContent.trim();
        var txt=c.textContent.trim();
        // 如果是我们的回复，记录被回复者
        if(u==='OPC-王宇轩' && txt.indexOf('回复')===0){
            var m=txt.match(/^回复\s*([^:：]+)/);
            if(m)repliedUsers[m[1].trim()]=true;
        }
        // 如果是我们直接跟在某人后面的回复（无前缀）
        if(u==='OPC-王宇轩' && i>0){
            var prev=items[i-1].querySelector('.comment-user-name');
            if(prev)repliedUsers[prev.textContent.trim()]=true;
        }
        all.push({i:i,user:u,text:txt,is_self:u==='OPC-王宇轩',is_bot:u==='元宝'});
    }
    // 过滤出未回复的
    var unreplied=[];
    for(var j=0;j<all.length;j++){
        var a=all[j];
        if(a.is_self)continue;
        if(repliedUsers[a.user])continue;
        unreplied.push(JSON.stringify({i:a.i,user:a.user,text:a.text.substring(0,80),is_bot:a.is_bot}));
    }
    return '['+unreplied.join(',')+']';
})()" 10
    ;;

reply)
    [ -z "${2:-}" ] || [ -z "${3:-}" ] && fail "用法: channels-reply.sh reply <username> <text>"
    _target_user="$2"
    _reply_text="$3"
    info "回复 $_target_user"

    # Step 1: 按用户名找到评论，点回复按钮
    rm -f /tmp/wp-result-$TAB.txt
    # JS locates reply button coords, then native click
    _reply_coords=$(wp_js $TAB "(function(){var sr=$SR;var items=sr.querySelectorAll('.comment-item');for(var i=0;i<items.length;i++){var n=items[i].querySelector('.comment-user-name');if(n&&n.textContent.trim()==='$_target_user'){var acts=items[i].querySelector('.comment-actions');if(!acts)continue;var btns=acts.querySelectorAll('.action-item');if(btns.length>1){var r=btns[1].getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2)}}}return 'NOT_FOUND'})()" 5)
    if echo "$_reply_coords" | grep -qE '[0-9]+,[0-9]+'; then
        _x=$(echo "$_reply_coords" | grep -oE '[0-9]+,[0-9]+' | cut -d, -f1)
        _y=$(echo "$_reply_coords" | grep -oE '[0-9]+,[0-9]+' | cut -d, -f2)
        wp_click $TAB "$_x" "$_y"
        echo "ok: clicked" > /tmp/wp-result-$TAB.txt
    else
        echo "ok: NOT_FOUND" > /tmp/wp-result-$TAB.txt
    fi
    sleep 3
    if grep -q "NOT_FOUND" /tmp/wp-result-$TAB.txt 2>/dev/null; then
        fail "用户 '$_target_user' 未找到"
    fi

    # Step 2: inputel — 一条命令搞定（native click 拿焦点 + 剪贴板粘贴，穿透 Shadow DOM）
    rm -f /tmp/wp-result-$TAB.txt
    echo "inputel \"textarea.create-input\" $_reply_text" > /tmp/wp-cmd-$TAB.js
    sleep 5

    # 验证 textarea 确实有内容（防空提交）
    rm -f /tmp/wp-result-$TAB.txt
    echo "(function(){var sr=$SR;var ta=sr.querySelector('textarea.create-input');return ta?'len:'+ta.value.length:'no ta'})()" > /tmp/wp-cmd-$TAB.js
    sleep 2
    if grep -q "len:0" /tmp/wp-result-$TAB.txt 2>/dev/null; then
        info "inputel 未生效，重试..."
        rm -f /tmp/wp-result-$TAB.txt
        echo "inputel \"textarea.create-input\" $_reply_text" > /tmp/wp-cmd-$TAB.js
        sleep 6
    fi

    # Step 4: 点击"评论"提交
    rm -f /tmp/wp-result-$TAB.txt
    wp_jsclick $TAB "(function(){var sr=$SR;var btn=sr.querySelector('.comment-create-content .tag-wrap.primary');if(btn){var r=btn.getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2)}return 'no btn'})()"
    echo "ok: submitted" > /tmp/wp-result-$TAB.txt
    sleep 3

    # Step 5: 验证回复确实出现（防静默失败）
    sleep 2
    rm -f /tmp/wp-result-$TAB.txt
    echo "(function(){var sr=$SR;var items=sr.querySelectorAll('.comment-item');for(var i=items.length-1;i>=Math.max(0,items.length-5);i--){var n=items[i].querySelector('.comment-user-name');if(n&&n.textContent.trim()==='OPC-王宇轩'){var c=items[i].querySelector('.comment-content');if(c&&c.textContent.trim().length>0)return 'VERIFIED:'+c.textContent.trim().substring(0,30)}}return 'NOT_VERIFIED'})()" > /tmp/wp-cmd-$TAB.js
    sleep 2
    if grep -q "VERIFIED" /tmp/wp-result-$TAB.txt 2>/dev/null; then
        ok "已回复 $_target_user ✓验证通过"
    elif grep -q "submitted" /tmp/wp-result-$TAB.txt 2>/dev/null; then
        info "已提交但未验证到回复（可能是空提交），请检查"
    else
        fail "提交失败"
    fi
    ;;

verify)
    info "核验回复是否对上了目标评论"
    _verify_raw=$(wp_js $TAB "
(function(){
    var sr=$SR;
    var items=sr.querySelectorAll('.comment-item');
    var pairs=[];
    for(var i=0;i<items.length;i++){
        var n=items[i].querySelector('.comment-user-name');
        var c=items[i].querySelector('.comment-content');
        if(!n||!c)continue;
        var u=n.textContent.trim();
        var t=c.textContent.trim();
        if(u==='OPC-王宇轩'){
            // 找这条回复的目标：看 '回复 XXX:' 前缀或紧挨的上一条非自己评论
            var target='unknown';
            var m=t.match(/^回复\\s*([^:：]+)/);
            if(m){target=m[1].trim();}
            else if(i>0){
                for(var j=i-1;j>=0;j--){
                    var pn=items[j].querySelector('.comment-user-name');
                    if(pn&&pn.textContent.trim()!=='OPC-王宇轩'){target=pn.textContent.trim();break;}
                }
            }
            pairs.push(JSON.stringify({target:target,reply:t.substring(0,80)}));
        }
    }
    return '['+pairs.join(',')+']';
})()" 10)
    _verify_raw="${_verify_raw#ok: }"
    echo "$_verify_raw" > /tmp/channels-verify.json
    python3 -c "
import json
with open('/tmp/channels-verify.json') as f:
    pairs = json.load(f)
ok = 0
bad = 0
for p in pairs:
    reply = p['reply']
    target = p['target']
    # 简单检查：回复内容是否和目标相关
    status = '✓'
    # 标记空回复
    if len(reply.strip()) < 2:
        status = '✗ 空回复'
        bad += 1
    else:
        ok += 1
    print(f'  {status} → {target}: {reply[:50]}')
print(f'--- {ok} ok / {bad} bad / {len(pairs)} total ---')
"
    ;;

record_fans_all)
    info "遍历所有视频，记录全部粉丝（账号级别）"
    # 获取视频数量
    _video_count=$(wp_js $TAB "(function(){var sr=$SR;return sr.querySelectorAll('.comment-feed-wrap').length})()" 5)
    _video_count="${_video_count#ok: }"
    _video_count=$(echo "$_video_count" | tr -d ' ')

    for _vi in $(seq 0 $((_video_count - 1))); do
        info "视频 $_vi / $((_video_count - 1))"
        # 选中
        wp_jsclick $TAB "(function(){var sr=$SR;var items=sr.querySelectorAll('.comment-feed-wrap');var r=items[$_vi].getBoundingClientRect();return Math.round(r.x+r.width/2)+','+Math.round(r.y+r.height/2);})()" > /dev/null
        sleep 2
        # 加载全部
        for _si in $(seq 1 15); do
            _sh=$(wp_js $TAB "(function(){var sr=$SR;var w=sr.querySelector('.feed-comment__wrp');if(!w)return '0';w.scrollTop=w.scrollHeight;return ''+w.scrollHeight})()" 5)
            _sh="${_sh#ok: }"
            sleep 2
            _sh2=$(wp_js $TAB "(function(){var sr=$SR;var w=sr.querySelector('.feed-comment__wrp');return ''+w.scrollHeight})()" 5)
            _sh2="${_sh2#ok: }"
            [ "$_sh" = "$_sh2" ] && break
        done
        # 记录粉丝
        _fans_raw=$(wp_js $TAB "
(function(){
    var sr=$SR;
    var items=sr.querySelectorAll('.comment-item');
    var users={};
    for(var i=0;i<items.length;i++){
        var n=items[i].querySelector('.comment-user-name');
        var c=items[i].querySelector('.comment-content');
        if(!n||!c)continue;
        var u=n.textContent.trim();
        if(u==='OPC-王宇轩')continue;
        if(!users[u])users[u]={text:c.textContent.trim().substring(0,60),is_bot:u==='元宝'};
    }
    return JSON.stringify(users);
})()" 10)
        _fans_raw="${_fans_raw#ok: }"
        echo "$_fans_raw" > /tmp/channels-fans-raw.json
        python3 -c "
import json, os
from datetime import datetime
fans_file = '$FANS_FILE'
now = datetime.now().strftime('%Y-%m-%d')
with open('/tmp/channels-fans-raw.json') as f:
    current = json.load(f)
data = {'platform':'channels','account':'OPC-王宇轩','fans':{}}
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
            'last_comment': info['text'], 'is_bot': info.get('is_bot', False),
            'tags': [], 'notes': ''
        }
        new_count += 1
data['last_scan'] = now
with open(fans_file, 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f'  video $_vi: {len(current)} users ({new_count} new)')
"
    done
    ok "全部视频粉丝已记录"
    ;;

scan)
    info "全量扫描：加载评论 + 标注新老朋友 + 输出待回复"
    # 获取所有评论
    _scan_raw=$(wp_js $TAB "
(function(){
    var sr=$SR;
    var items=sr.querySelectorAll('.comment-item');
    var all=[];
    var repliedUsers={};
    for(var i=0;i<items.length;i++){
        var n=items[i].querySelector('.comment-user-name');
        var c=items[i].querySelector('.comment-content');
        var t=items[i].querySelector('.comment-time');
        if(!n||!c)continue;
        var u=n.textContent.trim();
        var txt=c.textContent.trim();
        if(u==='OPC-王宇轩'){
            var m=txt.match(/^回复\s*([^:：]+)/);
            if(m)repliedUsers[m[1].trim()]=true;
            continue;
        }
        all.push(JSON.stringify({user:u,text:txt.substring(0,100),time:t?t.textContent.trim():'',is_bot:u==='元宝'}));
    }
    return JSON.stringify({comments:all.map(function(s){return JSON.parse(s)}),replied:repliedUsers});
})()" 10)
    _scan_raw="${_scan_raw#ok: }"
    echo "$_scan_raw" > /tmp/channels-scan-raw.json

    # 结合粉丝记忆，标注新老朋友
    python3 -c "
import json, os, sys
from datetime import datetime

fans_file = '$FANS_FILE'
with open('/tmp/channels-scan-raw.json') as f:
    raw = json.load(f)

# 加载粉丝数据
fans = {}
if os.path.exists(fans_file):
    with open(fans_file) as f:
        fans = json.load(f).get('fans', {})

comments = raw['comments']
replied = raw['replied']
now = datetime.now().strftime('%Y-%m-%d')

result = []
for c in comments:
    u = c['user']
    fan_info = fans.get(u, {})
    is_new = u not in fans
    visit_count = fan_info.get('interactions', 0)
    is_replied = u in replied

    entry = {
        'user': u,
        'text': c['text'],
        'time': c['time'],
        'is_bot': c['is_bot'],
        'is_replied': is_replied,
        'fan_status': 'new' if is_new else f'returning(x{visit_count})',
        'first_seen': fan_info.get('first_seen', now),
        'tags': fan_info.get('tags', [])
    }
    if not is_replied:
        result.append(entry)

print(json.dumps(result, ensure_ascii=False, indent=2))
print(f'--- {len(result)} unreplied / {len(comments)} total | {sum(1 for r in result if \"new\" in r[\"fan_status\"])} new fans ---')
"
    ;;

fans)
    info "粉丝列表"
    if [ ! -f "$FANS_FILE" ]; then
        fail "无粉丝数据，先运行 scan + record_fans"
    fi
    python3 -c "
import json
with open('$FANS_FILE') as f:
    data = json.load(f)
fans = data.get('fans', {})
sorted_fans = sorted(fans.items(), key=lambda x: x[1].get('interactions', 0), reverse=True)
print(f'共 {len(fans)} 位互动用户')
print()
for name, info in sorted_fans[:30]:
    tags = ' '.join(info.get('tags', []))
    print(f'  {name} | x{info.get(\"interactions\",0)} | {info.get(\"first_seen\",\"?\")} | {tags}')
"
    ;;

record_fans)
    info "记录当前评论区用户到粉丝库"
    _fans_raw=$(wp_js $TAB "
(function(){
    var sr=$SR;
    var items=sr.querySelectorAll('.comment-item');
    var users={};
    for(var i=0;i<items.length;i++){
        var n=items[i].querySelector('.comment-user-name');
        var c=items[i].querySelector('.comment-content');
        if(!n||!c)continue;
        var u=n.textContent.trim();
        if(u==='OPC-王宇轩')continue;
        if(!users[u])users[u]={text:c.textContent.trim().substring(0,60),is_bot:u==='元宝'};
    }
    return JSON.stringify(users);
})()" 10)
    _fans_raw="${_fans_raw#ok: }"
    echo "$_fans_raw" > /tmp/channels-fans-raw.json

    python3 -c "
import json, os
from datetime import datetime

fans_file = '$FANS_FILE'
now = datetime.now().strftime('%Y-%m-%d')
with open('/tmp/channels-fans-raw.json') as f:
    current = json.load(f)

# 加载已有
data = {'platform':'channels','account':'OPC-王宇轩','fans':{}}
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
            'first_seen': now,
            'last_seen': now,
            'interactions': 1,
            'last_comment': info['text'],
            'is_bot': info.get('is_bot', False),
            'tags': [],
            'notes': ''
        }
        new_count += 1

data['last_scan'] = now
with open(fans_file, 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'updated: {len(current)} users ({new_count} new, {len(current)-new_count} returning)')
"
    ok "粉丝数据已更新"
    ;;

snapshot)
    info "保存快照到 $SNAPSHOT_FILE"
    # 获取当前视频列表
    _videos_json=""
    _videos_json=$(wp_js $TAB "(function(){var sr=$SR;var items=sr.querySelectorAll('.comment-feed-wrap');var r=[];for(var i=0;i<items.length;i++){var t=items[i].querySelector('.feed-title');var c=items[i].querySelector('.feed-comment-total');r.push(JSON.stringify({title:t?t.textContent.trim().substring(0,60):'',comments:c?parseInt(c.textContent.trim()):0}))}return '['+r.join(',')+']'})()" 5)

    # 获取当前已回复用户（从当前选中视频）
    _replied_json=""
    _replied_json=$(wp_js $TAB "
(function(){
    var sr=$SR;
    var items=sr.querySelectorAll('.comment-item');
    var users={};
    for(var i=0;i<items.length;i++){
        var n=items[i].querySelector('.comment-user-name');
        var c=items[i].querySelector('.comment-content');
        if(!n||!c)continue;
        var u=n.textContent.trim();
        var txt=c.textContent.trim();
        if(u!=='OPC-王宇轩'&&u!=='元宝')users[u]=txt.substring(0,60);
    }
    return JSON.stringify(users);
})()" 10)

    # 写快照
    _ts=""
    _ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    # 清理 "ok: " 前缀
    _videos_json="${_videos_json#ok: }"
    _replied_json="${_replied_json#ok: }"
    python3 -c "
import json,sys
snap = {
    'last_scan': '$_ts',
    'videos': json.loads('''$_videos_json'''),
    'seen_users': json.loads('''$_replied_json''')
}
# 合并已有快照
import os
if os.path.exists('$SNAPSHOT_FILE'):
    with open('$SNAPSHOT_FILE') as f:
        old = json.load(f)
    old['last_scan'] = snap['last_scan']
    old['videos'] = snap['videos']
    old.setdefault('seen_users', {}).update(snap['seen_users'])
    snap = old
with open('$SNAPSHOT_FILE', 'w') as f:
    json.dump(snap, f, ensure_ascii=False, indent=2)
print(f'saved: {len(snap[\"seen_users\"])} users tracked')
"
    ok "快照已保存"
    ;;

diff)
    if [ ! -f "$SNAPSHOT_FILE" ]; then
        fail "无快照文件，先运行 snapshot"
    fi
    info "对比增量"
    # 获取当前评论用户
    _current=""
    _current=$(wp_js $TAB "
(function(){
    var sr=$SR;
    var items=sr.querySelectorAll('.comment-item');
    var users=[];
    for(var i=0;i<items.length;i++){
        var n=items[i].querySelector('.comment-user-name');
        var c=items[i].querySelector('.comment-content');
        if(!n||!c)continue;
        var u=n.textContent.trim();
        if(u==='OPC-王宇轩')continue;
        users.push(JSON.stringify({user:u,text:c.textContent.trim().substring(0,60)}));
    }
    return '['+users.join(',')+']';
})()" 10)
    _current="${_current#ok: }"
    echo "$_current" > /tmp/channels-diff-raw.json

    python3 -c "
import json
with open('$SNAPSHOT_FILE') as f:
    snap = json.load(f)
seen = set(snap.get('seen_users', {}).keys())
with open('/tmp/channels-diff-raw.json') as f:
    current = json.load(f)
new_comments = [c for c in current if c['user'] not in seen]
print(json.dumps(new_comments, ensure_ascii=False, indent=2))
print(f'--- {len(new_comments)} new / {len(current)} total ---')
"
    ;;

screenshot)
    wp_screenshot $TAB
    ok "截图: $(wp_screenshot_file $TAB)"
    ;;

help|*)
    echo "视频号评论互动 — tab 3"
    echo ""
    echo "用法: $(basename "$0") <action> [args...]"
    echo ""
    echo "动作:"
    echo "  open                      打开评论管理页"
    echo "  videos                    列出视频+评论数"
    echo "  select <index>            选中第N个视频"
    echo "  load_all                  滚动加载全部评论"
    echo "  scan                      全量扫描+标注新老朋友+输出待回复"
    echo "  dump                      导出全部评论(JSON)"
    echo "  unreplied                 未回复评论列表"
    echo "  reply <user> <text>       回复指定用户(paste+验证)"
    echo "  verify                    核验回复是否对上目标评论"
    echo "  record_fans               记录当前视频用户到粉丝库"
    echo "  record_fans_all           遍历所有视频记录粉丝（账号级别）"
    echo "  fans                      查看粉丝列表"
    echo "  snapshot                  保存快照"
    echo "  diff                      对比增量"
    echo "  screenshot                截图"
    ;;

esac
