# Step 6: 产 karaoke.html（中英字级同步播放器）· Code

## CLI

```bash
nf karaoke <episode-dir>
# 等价: nf-cli karaoke <episode-dir>
# Code · Rust 实现 · 模板 include_str! 嵌入 binary · 零外部依赖
# 读 <episode>/clips/cut_report.json + clip_NN.translations.*.json + <episode>/sources/<slug>/words.json
# 产 <episode>/clips/index.html (sidebar 所有 clips 可切 · 视频 + 双行字幕卡 + 字级高亮)
```

**不是 python 脚本** · 是 nf-cli 内置子命令。跟 nf-tts karaoke (v1.12.2) 同模式 · include_str! 把 HTML 模板烘进 binary · 运行时零文件依赖。

## 输入

- `<episode>/clips/clip_NN.mp4` · 若干 mp4 （cut 产物）
- `<episode>/clips/cut_report.json` · 每 clip 的 start/end 秒（**不是 sentence id**）+ duration + file + title
- `<episode>/clips/clip_NN.translations.zh.json` · 每 clip 每语言一份 · segments[{en, start, end, cn: [{text, start, end}]}]
- `<episode>/sources/<slug>/words.json` · 原视频整段 whisperx 词级 (2000+ words 常见) · [{text, start, end}] 秒

## 产出（gate: karaoke-html-ready）

```
<episode>/clips/index.html              # sidebar 可切所有 clips · self-contained (data inline)
<episode>/clips/clip_NN.karaoke.html    # 每 clip 单独 HTML （可选 · 方便直接分享）
```

## 硬规则

1. **data 必须 inline 到 HTML**（JS 常量）· 不要 `fetch()` json · `file://` 下会被浏览器 block（真踩过坑）。
2. **时间戳 reset 到 clip 0** · ffmpeg 切的 clip 内部时间从 0 开始 · 必须 `(source_time - clip.start)` 重算。
3. **cue 切换按 segment**（句级）· 不是全屏滚字：底部一个卡片 · 只显当前 segment 的 en + 当前 cue 的 zh · 过了淡掉。
4. **字级高亮双轨独立**：
   - 英文词级 · 直接用 words.json 过滤 `{start,end} ∈ segment 区间` · whisperx 精准对齐
   - 中文字级 · 按 cue 内字数**线性插值** · `char_dur = cue_dur / len(text)` · 每字 span
5. **英文橙 / 中文紫**（视觉区分双行）· past 色淡 · active 放大 + 发光。
6. **video 用 `<video controls>`** · 不是 `<audio>` · 用 currentTime 作唯一时钟。
7. **键盘**：Space 播停 · ← → 跳 0.5s · 必带。

## 字级插值逻辑 (python 伪码)

```python
# 中文字级
for cue in segment['cn']:
    cs_ms = (cue['start'] - clip_start) * 1000
    ce_ms = (cue['end']   - clip_start) * 1000
    char_dur = (ce_ms - cs_ms) / max(len(cue['text']), 1)
    for i, ch in enumerate(cue['text']):
        zh_chars.append({
          'text': ch,
          'start_ms': int(cs_ms + i * char_dur),
          'end_ms': int(cs_ms + (i+1) * char_dur)
        })

# 英文词级（已精准 · 只 reset 时间戳）
for w in words_json:
    if segment.start - 0.1 <= w['start'] and w['end'] <= segment.end + 0.1:
        en_words.append({
          'text': w['text'],
          'start_ms': max(0, int((w['start'] - clip_start) * 1000)),
          'end_ms':   max(0, int((w['end']   - clip_start) * 1000))
        })
```

## tick() 循环逻辑

```javascript
function tick() {
  const tMs = video.currentTime * 1000;
  const segIdx = curSegs.findIndex(s => tMs >= s.start_ms && tMs < s.end_ms);
  if (segIdx !== lastSegIdx) {
    renderSegmentWords(curSegs[segIdx]); // 换行 · 重置 spans
    lastSegIdx = segIdx;
  }
  highlightWords(enLine, curSegs[segIdx].en_words, tMs); // past/active/future
  highlightWords(zhLine, curSegs[segIdx].zh_chars, tMs);
  if (!video.paused) requestAnimationFrame(tick);
}
```

## 验收

- 打开 `<episode>/clips/index.html` · video 播放 · 字幕卡字级扫过
- 点左侧 clip 切换 · video + 字级数据同步换
- 英文词 whisperx 精准 · 中文字 cue 内均分 · 肉眼对上口型（差 ≤ 200ms 可接受）

## 不做

- ❌ 不做全段滚动字幕（像 LRC）· 一次一 cue 够了
- ❌ 不用外部库（Plyr / Video.js）· 零 CDN · self-contained 单 HTML
- ❌ 不 fetch · 全 inline
- ❌ 不做跨 clip 拖动（每 clip 独立 video 元素 · 切 clip = 换 src）

## 为啥本步存在

视频切出来没字幕 · 观众看不懂。需要**实感交付物** · 不是"srt 文件自己拖进播放器" · 是"双击 HTML 就能看懂"。验收快 · 分享快 · PM / 同事看片快。

历史教训（BUG-20260419 验证）：`clip_NN.mp4` 本身无字幕 · translations.zh.json 有数据但没消费方 → 加本步自动产 karaoke HTML · 端到端闭环。
