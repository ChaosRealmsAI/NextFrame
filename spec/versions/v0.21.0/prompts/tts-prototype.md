# 任务 · v0.21.0 · TTS prototype hifi HTML

主 agent 已开 quality scope 锁 `feature:v0.21.0-design`。你是 v0.21.0 的 **TTS** 路 · 出 1 张 hifi 静态 prototype HTML(可双击打开 · 不 build)。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame
```

## 必读现状

```bash
cat spec/charter.md
cat spec/architecture.md
cat spec/design/DESIGN.md
cat spec/design/tokens.css
cat spec/design/prototypes/editor-v0.1.html | head -60
cat spec/bdd/v0.21.0-design/scenarios/tts-prototype.json
cat examples/v2-showcase/compositions/showreel-24s.json | head -80    # 看现有 audio track
```

## harness preflight(硬)

```bash
harness tools
harness search "audio"
harness search "screenshot"
harness show nf-capture
```

复用 nf-capture · 不造新工具(设计稿无需自动 audio 验证)。

## 交付 1 件

### `spec/versions/v0.21.0/prototypes/tts.html`

**主题**:**AI 怎么给 composition 配音** — 文本 → 音轨 · 音色 / 语速 / 字幕同步。PM 5 秒看懂"AI 选了晓晓 · 加了 7 段配音 · 字幕跟上"。

**画面布局**(audio-centric · 上下分块):

```
┌──────────────────────────────────────────────────┐
│ topbar · NextFrame · v0.21.0-design · TTS 路    │
├──────────────────────────────────────────────────┤
│ 左 50% · 文本区                                  │
│   段 1 · "今天讲 AI 怎么..."   [ ▷ 0:00-0:03 ]  │
│   段 2 · "工具墙是 AI 的..."   [ ▷ 0:03-0:08 ]  │
│   段 3 · "三步循环 ..."        [ ▷ 0:08-0:14 ]  │
│   ...                                           │
│   配音参数(玻璃卡):                              │
│     · 音色 · 晓晓(zh-CN-XiaoxiaoNeural)         │
│     · 语速 · 1.0x                               │
│     · 后端 · vox doubao-cdp                     │
├──────────────────────────────────────────────────┤
│ 右 50% · 音频波形 + 字幕同步                     │
│                                                  │
│ 段 1 ▁▂▃▅▇▆▄▂▁ ▏ "今天讲 AI 怎么..."             │
│                  ─────────────────               │
│                  字幕 word-level highlight        │
│ 段 2 ▁▃▅▇▅▃▁     "工具墙是 AI..."                │
│ 段 3 ▁▂▄▆▇▇▅▃▁   "三步循环..."                   │
│ ...                                              │
│                                                  │
│ AI 操作日志(右下):                              │
│   • 14:30 · 切句 7 段                           │
│   • 14:30 · 派 vox batch(并行)                   │
│   • 14:30 · ✓ 7/7 mp3 + timeline                │
│   • 14:30 · 字幕轨自动对齐                      │
└──────────────────────────────────────────────────┘
```

**硬要求**:

1. 静态 HTML · 双击打开 · 不 build
2. `<link rel="stylesheet" href="../../../design/tokens.css">` + inline `<style>`
3. **直角风** · 无 emoji · 玻璃
4. **真实 mock 数据** · 7 段文本用 NextFrame 自己语境(从 spec/charter 摘 · 不编)· 时长合理(3-8s 每段)
5. **音频波形** · 用 SVG path 画 mock 波形 · 7 段不同形状(不要全 sin) · monospace 时间码
6. **字幕同步** · 文本下面有 word-level 高亮指示("今天讲 AI 怎么..." 当前播放词加 underline 或 background highlight)
7. **AI 操作日志** · 右下小窗 · 4-6 条 timestamp 显示 vox 调用流程 · 琥珀色时间码
8. **vox / 配音参数面板** · 玻璃卡片(backdrop-filter blur 40px) · 显示 voice / 语速 / 后端
9. **PM 心智** · "TTS(文字转语音)" · "字幕轨" · "音色" · "word-level(逐词)" 必带翻译
10. **顶 bar** · 左 logo + 项目名 + 版本号 + TTS 路 · 右 mac dots

**禁**:同 script / cut · 不动产品代码 / spec JSON / 不 commit / 不 emoji / 不圆角 / 不灰字。

## 报告

- ✅/❌ 文件存在 · `wc -l spec/versions/v0.21.0/prototypes/tts.html`
- ✅/❌ tokens.css 引用
- ✅/❌ 真实数据 + 7 段不同波形
- ✅/❌ 双击渲染验证(`open` 一次)
