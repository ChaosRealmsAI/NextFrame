# 任务 · v0.21.0 · script prototype hifi HTML

主 agent 已开 quality scope 锁 `feature:v0.21.0-design`。你是 v0.21.0 的 **script** 路 · 出 1 张 hifi 静态 prototype HTML(可双击打开 · 不 build)。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame
```

## 必读现状

```bash
cat spec/charter.md                                         # 北极星 + 红线 + 假设
cat spec/architecture.md                                    # 架构原则 + 对象模型
cat spec/design/DESIGN.md                                   # 视觉规范(直角 · 紫琥珀青灰白 · 无 emoji · backdrop-filter 玻璃)
cat spec/design/tokens.css                                  # 唯一 CSS 变量源
cat spec/design/prototypes/editor-v0.1.html | head -60      # 看现有 hifi prototype 的代码风格
cat spec/bdd/v0.21.0-design/scenarios/script-prototype.json # 你的 BDD 验收
ls examples/v2-showcase/compositions/                       # 看真 v2 composition JSON 样例
cat examples/v2-showcase/compositions/showreel-24s.json | head -60
```

读完再写。

## harness preflight(硬)

```bash
harness tools                       # 看墙
harness search "screenshot"          # 找视觉验证工具
harness search "capture"
harness show nf-capture
```

prototype 是设计稿 · 主 agent 用 nf-capture / nf-screenshot 拿截图 evidence。**你不需要新造工具** · 这次复用现成 nf-capture(等价覆盖)。

## 交付 1 件

### `spec/versions/v0.21.0/prototypes/script.html`

**主题**:**AI 怎么从 script 生成 composition** — PM 5 秒看懂的 hifi 静态预演。

**画面布局**(参考 editor-v0.1.html 的 4-pane 风格 · 但只展示 script → composition 流程):

```
┌──────────────────────────────────────────────────┐
│ topbar · NextFrame · v0.21.0-design · script 路  │
├──────────────────┬───────────────────────────────┤
│ 左 40%           │ 右 60%                        │
│ Script 输入区    │ AI 生成的 composition mock    │
│                  │                               │
│ <textarea-mock>  │ <track-1 mock>                │
│ "今天发布 ..."   │   intro · 0-3s                │
│                  │ <track-2 mock>                │
│ 旁注:            │   title · 3-9s                │
│ - AI 在分句      │ <track-3 mock>                │
│ - AI 在标节奏    │   body · 9-21s                │
│ - AI 在挑组件    │ <track-4 mock>                │
│                  │   outro · 21-24s              │
│                  │                               │
│                  │ ↓                             │
│                  │ ASCII timeline                │
│                  │ |■■■|■■■■■■|■■■■■■■■■■■■|■■■|│
└──────────────────┴───────────────────────────────┘
```

**硬要求**:

1. **静态 HTML · 双击打开**(file://)· 不要 build / 不要 framework / 不要外网 fetch
2. **`<link rel="stylesheet" href="../../../design/tokens.css">`** 引用 tokens · 不写死颜色
3. **`<style>` inline 在文件内**(不外联 css 文件 · 防 file:// path 错)
4. **直角风** · `border-radius: 0`(例外 · mac dots 圆 + 圆点标记)
5. **无 emoji** · 用 SVG 线框图标 / unicode bullet
6. **玻璃质感** · 关键卡片 `backdrop-filter: blur(40px) saturate(2.0)`
7. **真实 mock 数据** · 用 examples/v2-showcase/compositions/showreel-24s.json 的实际数据(track names / 时长 / 组件 id)· 不编造
8. **AI 旁注** · 左侧 textarea 旁有 3-5 条小字 · 显示"AI 在做什么"(分句 / 标节奏 / 挑组件)
9. **PM 心智术语** · 必带翻译 · 例 "track(轨道) · 一行画面" · "composition(合成) · 一段视频"
10. **顶 bar** · 左 logo + 项目名 + 版本号 · 右 mac dots(关闭 / 最小化 / 最大化 · 直径 12px 圆)

**禁**:

- 不动产品代码 src/
- 不动 spec/{bdd,devlog,contracts,harness,poc,quality}/** JSON · 全走 CLI
- 不跑 quality claim/release · 主 agent 持锁
- 不 commit · 不 push · 不 release
- 不用 emoji / 圆角 / 彩色渐变 / 灰字 / "MVP 占位"

## 报告

- ✅/❌ 文件存在 · `wc -l spec/versions/v0.21.0/prototypes/script.html`
- ✅/❌ tokens.css 引用上 · `head -20` 含 `<link ... tokens.css>`
- ✅/❌ 真实数据(showreel-24s.json 引用)
- ✅/❌ 双击 file:// 打开能渲染 · 你自己用 `open spec/versions/v0.21.0/prototypes/script.html` 试一次
