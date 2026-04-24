# W-4 · Web Components 8 tags + shell.css(独立于 W-1)

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.2-W4-ally` (独立 worktree · 有 v0.1.1 `frontend/nf-components/` stub + `spec/design/tokens.css`)

**目标**: 产 8 个 Web Components 完整实现 · 读 mock JSON 渲染 editor-v0.1.html 1:1 视觉 · 组件间耦合(base class + tokens 挂载方式)· 一次一 agent 跑完保持一致性。

## 必读(顺序)

1. `spec/poc/P-03-wc-tokens/merged.md` — **架构方案已锁**(NfBase + adoptedStyleSheets + tokens 挂 :root + 直角 reset base sheet)· 照抄
2. `spec/poc/P-03-wc-tokens/opus/src/` — 真跑代码参考(NfBase 模板 + :host([kind]) + 穿透)
3. `spec/versions/v0.2/drafts/merged.md` · §W-4 章节
4. `spec/design/prototypes/editor-v0.1.html` — **golden reference · 视觉 100% 等同**
5. `spec/design/tokens.css` — 色值源
6. `spec/contracts/interfaces.json` · Web Components 段(8 tag attribute + events)
7. `spec/versions/v0.2/spec.json` · S-07~S-18(视觉 + 交互)

## 产出路径(CWD 内 frontend/nf-components/)

```
frontend/nf-components/
├── package.json        <- 已有 stub · 加 typescript + esbuild + playwright(测试用)
├── tsconfig.json       <- 已有 stub
├── index.html          <- 入口 · <link rel=preload href=tokens.css> 早挂(A-0009 FOUC 解)
├── tokens.css          <- symlink 或 copy spec/design/tokens.css
├── mock.json           <- 7 clips + 14 log + 4 anchors + inspector fields(从 editor-v0.1.html 抽)
├── src/
│   ├── index.ts        <- 入口 · customElements.define 8 tag
│   ├── _base.ts        <- NfBase + adoptedStyleSheets 单例 + 直角 reset
│   ├── storage.ts      <- 读 mock.json(v0.2 假数据 · 不接 IPC · W-5 再接)
│   ├── events.ts       <- CustomEvent 类型 + bus
│   └── components/
│       ├── topbar.ts       <- 红黄绿灯 + home + 项目/集 drop + 4 tabs + 中文切换
│       ├── clips.ts        <- 7 clips(5 scene + 2 audio · feat-2 active)
│       ├── log.ts          <- 14 log entries 倒序
│       ├── timeline.ts     <- 4 轨 + 7 clips + 4 anchor + playhead
│       ├── track.ts        <- :host([kind=scene/text/audio/trans]) 切色
│       ├── clip.ts         <- 单 clip 方块
│       ├── anchor.ts       <- 琥珀倒三角 + tooltip
│       └── inspector.ts    <- 右栏 · 显 clip 属性
└── dist/
    └── index.js        <- esbuild bundle
```

## 硬约束 · 视觉 === hifi

editor-v0.1.html 是 golden reference · 8 组件渲染后 `pixel diff < 1%`(POC P-01 证 wry=Safari 同引擎 · 同 CSS 必像素一致)。**CSS 从 editor-v0.1.html 抽 · 不重写**。

### CSS 抽法
- 全局(body / .outer / .app / aurora + grain)→ `index.html` 自带 style 或单独 `shell.css`
- 组件特有(.topbar / .panel / .clip / .track / ...)→ 各组件 NfBase sheet

### 关键 CSS 结构(POC 发现)
- `.app` 有 `backdrop-filter: blur(50px) saturate(1.5)` · **不是 `.topbar`**(S-07 ai_tools 据此)
- 每组件 base sheet 塞:`:host, *, *::before, *::after { box-sizing: border-box; border-radius: 0 }`(shadow 不跨 main reset)

## NfBase 模板(照 P-03 opus)

```ts
// src/_base.ts
const RESET = `
  :host, *, *::before, *::after {
    box-sizing: border-box;
    border-radius: 0;
    margin: 0;
    padding: 0;
  }
  :host { display: block; }
`;

export abstract class NfBase extends HTMLElement {
  protected root: ShadowRoot;

  constructor(componentCss: string) {
    super();
    this.root = this.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(RESET + componentCss);
    this.root.adoptedStyleSheets = [sheet];
  }
}
```

每组件类 module-level 单例 sheet · 所有实例共享 · 性能优(POC n=100 快 1.8x)。

## 组件细节(按 interfaces.json)

### nf-topbar
- Attrs: `project-id` / `episode-id` / `current-tab` / `current-lang`
- Events: `tab-change` / `lang-change` / `home-click` / `project-dropdown-open` / `episode-dropdown-open`
- 红黄绿灯 + home(SVG) + 项目/集下拉 + 4 tabs(current 紫下划线)+ 语言切换

### nf-clips
- Attrs: `selected-id`
- Events: `clip-select`(detail {id, kind, duration})
- 7 行 · 每行 mk 色(紫 scene / 青 audio)+ name + duration · active 紫左 border

### nf-log
- Attrs: `reversed`(默认 true)· `count`
- 14 条 · 每条 3 行(kind+time / desc / cli)· 倒序 · 内部滚

### nf-timeline
- Attrs: `duration` / `current-time` / `zoom`
- Events: `playhead-move` / `anchor-hover` / `clip-select`
- 4 track row + 7 clip + 4 anchor + playhead · 绑 track/clip/anchor 为子组件

### nf-track(slot)
- Attrs: `kind=scene|text|audio|trans` · `label`
- `:host([kind=scene])` 切紫 · `[kind=text]` 琥珀 · `[kind=audio]` 青 · `[kind=trans]` 灰

### nf-clip
- Attrs: `id` / `start` / `end` / `label` / `kind`
- Events: `clip-click`

### nf-anchor
- Attrs: `name` / `time` / `color=amber|accent`
- Events: `anchor-hover` · tooltip 显示 `name · time.00s`

### nf-inspector
- Attrs: `clip-id`
- 4 段 · 位置 / 时间 / 关键帧 / 效果

## mock.json schema(v0.2 假数据 · 抄 editor-v0.1.html)

```json
{
  "project": { "id": "next-frame", "name": "NextFrame 产品介绍" },
  "episodes": [
    {
      "id": "ep-01",
      "name": "产品介绍",
      "duration": 60,
      "anchors": { "intro-end": 5.0, "feat-1-end": 12.0, "feat-2-end": 30.0, "feat-3-end": 48.0 },
      "clips": [/* 7 条 · 5 scene + 2 audio */],
      "log": [/* 14 条 · AI + human 混 */]
    }
  ]
}
```

## 验证要求

- `npm install && npm run build` 成功 · 产 `dist/index.js`
- `npx tsc --noEmit` 零 error
- **playwright 测试 3 项**:
  - DOM 结构:8 组件全 defined · 每个 shadowRoot mode=open
  - 渲染:`open index.html` 截图 vs `editor-v0.1.html` 截图 pixel diff < 1%(POC P-01 保证)
  - :host 属性切色:nf-track kind 3 值切 3 色(紫/琥珀/青)
- `W4-REPORT.md` 项目根 · 列每组件行数 + tests 结果 + 踩坑

## 硬约束

- **不 git commit**
- **不碰 W-1 W-2 W-3 W-5 范围**(纯前端 · 不 impl Rust)
- **不用 React/Vue/Svelte / 任何框架**(零框架原则 · rule 硬约束)
- **视觉 === editor-v0.1.html**(不重新设计 · 不加装饰)
- 时间预算:60-90min · blocker >15min 记 report 停

## 硬门
- npm run build 过
- tsc --noEmit 过
- 8 组件全 defined 且有 shadowRoot
- pixel diff < 1%(跟 editor-v0.1.html 对比)
