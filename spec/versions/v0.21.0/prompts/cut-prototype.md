# 任务 · v0.21.0 · cut prototype hifi HTML

主 agent 已开 quality scope 锁 `feature:v0.21.0-design`。你是 v0.21.0 的 **cut** 路 · 出 1 张 hifi 静态 prototype HTML(可双击打开 · 不 build)。

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
cat spec/bdd/v0.21.0-design/scenarios/cut-prototype.json
cat examples/v2-showcase/compositions/showreel-24s.json | head -60
```

## harness preflight(硬)

```bash
harness tools
harness search "screenshot"
harness show nf-capture
```

复用 nf-capture · 不造新工具(prototype 是设计稿 · 现有视觉验证工具够用)。

## 交付 1 件

### `spec/versions/v0.21.0/prototypes/cut.html`

**主题**:**AI 怎么剪辑 composition** — 时间轴 / 剪掉某段 / 拼接 / 时长调整。PM 5 秒看懂"AI 把这段从 5s 改到 3s"。

**画面布局**(timeline-driven · 跨整宽):

```
┌──────────────────────────────────────────────────┐
│ topbar · NextFrame · v0.21.0-design · cut 路     │
├──────────────────────────────────────────────────┤
│ 上 35% · preview 区(mock 视频画面 · 当前帧)     │
│   [video frame mock + AI 标注 "正在改这段"]      │
├──────────────────────────────────────────────────┤
│ 下 65% · 时间轴区                                │
│                                                  │
│ Track 1 [intro      ][               cut         │
│ Track 2 [    title 3-9s              ]           │
│ Track 3 [        body 9→21s ← AI 缩 3s ]         │
│ Track 4 [                   outro 21-24s]        │
│                                                  │
│ 时间码 · 0s ─ 6s ─ 12s ─ 18s ─ 24s               │
│                                                  │
│ AI 操作日志(右下小窗):                          │
│   • 14:22 · 检测到 body 太长                     │
│   • 14:22 · 把 body.duration 从 12s 改到 9s      │
│   • 14:22 · 调整 outro start 21s → 18s           │
│   • 14:22 · validate · ✓                         │
└──────────────────────────────────────────────────┘
```

**硬要求**:

1. 静态 HTML · 双击打开 · 不 build
2. `<link rel="stylesheet" href="../../../design/tokens.css">` + inline `<style>`
3. **直角风** · 无 emoji · 玻璃质感
4. **真实 mock 数据** · 用 showreel-24s.json 的 track names / 时长 / id
5. **AI 操作日志** · 右下角小窗 · 显示 4-6 条 timestamp 操作 · monospace · 琥珀色时间 + 灰白文本
6. **剪辑视觉** · 一个 track 显示"被缩短"的状态(视觉上看到从 12s 缩到 9s · 用箭头 / 半透明 ghost 表示"原本是这么长")
7. **track 颜色** · 不同 track 不同色调(紫主 + 琥珀 + 青) · 但都遵循 tokens
8. **PM 心智** · "track(轨道)" · "duration(时长)" · "validate(校验)" 必带翻译
9. **顶 bar** · 左 logo + 项目名 + 版本号 + cut 路标识 · 右 mac dots
10. **时间码** · monospace · 等距分隔(0s / 6s / 12s / 18s / 24s)

**禁**:同 script-prototype.md · 不动产品代码 / spec JSON / 不 commit / 不 emoji / 不圆角 / 不灰字。

## 报告

- ✅/❌ 文件存在 · `wc -l spec/versions/v0.21.0/prototypes/cut.html`
- ✅/❌ tokens.css 引用
- ✅/❌ 真实数据
- ✅/❌ 双击渲染验证(你跑 `open` 一次)
