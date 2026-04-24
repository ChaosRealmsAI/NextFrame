---
poc_id: P-03
topic: wc-tokens
agent: opus
affects_scenarios: [S-07, S-08, S-09, S-10, S-11, S-12, S-13, S-14]
status: valid
duration_min: 25
runtime:
  browser: Chromium 147.0.7727 (Headless)
  ua: "HeadlessChrome/147.0.7727.15 Safari/537.36"
  timestamp: 2026-04-21T07:17:16Z
verdict: tokens-penetrate + shadow-isolates + host-attr-works + adoptedStyleSheets-wins
---

# POC P-03 · Web Components + tokens.css :root 穿透 + 样式隔离

## 结论(一句话)

`:root` 定义的 CSS custom properties **穿透 shadow DOM**(规范行为 · inherit) · 主文档 `* { color: red !important }` **无法穿入** shadow(封装边界硬) · `:host([kind])` 属性选择器工作正常 · **`adoptedStyleSheets` 渲染快 ~2x**(n=100 · 1.5ms vs 3ms)。**v0.2 组件基类走 `attachShadow({mode:"open"}) + adoptedStyleSheets` · tokens 继续挂 `:root`** · 全 8 scenarios 无需降级。

## 测试结果

### 测试 A · tokens 穿透 [PASS]

| 步 | 动作 | `.box` 的 `background-color` | 期望 |
|---|---|---|---|
| A-1 | 页面加载(`--accent: #a78bfa`) | `rgb(167, 139, 250)` | `rgb(167, 139, 250)` PASS |
| A-2 | `documentElement.style.setProperty('--accent', '#ff0000')` | `rgb(255, 0, 0)` | `rgb(255, 0, 0)` PASS |
| A-3 | reset 回 `#a78bfa` | `rgb(167, 139, 250)` | `rgb(167, 139, 250)` PASS |

**证据**:
- 截图 `screenshots/test-a-1-initial-purple.png`(紫) → `test-a-2-flipped-red.png`(红)
- 浏览器 console `A-1 initial .box bg = rgb(167, 139, 250)` / `A-2 after flip(#ff0000) .box bg = rgb(255, 0, 0)`
- **机制**:CSS custom property 是**继承型属性**(W3C Custom Properties Level 1 §3.2) · shadow host 是 shadow tree 的 flat-tree parent · `--accent` 从 document `:root` → host → shadow tree 元素 · 无阻拦。

### 测试 B · 主文档污染隔离 [PASS]

| 目标 | inject 前 | inject 后 |
|---|---|---|
| main `<h1>` color | `rgb(244, 244, 248)` (= `--fg`) | `rgb(255, 0, 0)` PASS 被污染(期望) |
| shadow `.tab.cur` color | `rgb(167, 139, 250)` (= `--accent`) | `rgb(167, 139, 250)` PASS **未污染**(期望) |
| shadow `.box` color | `rgb(10, 10, 13)` (= `#0a0a0d` 硬编码) | `rgb(10, 10, 13)` PASS 未污染 |

inject 的 rule 是 `* { color: red !important }`(最强形态 · 全选符 + `!important`),shadow 内部 `.tab.cur` 原样保持 `var(--accent)`。**shadow DOM 封装边界是硬边界**(HTML Living Standard · shadow-including-tree-order) · 主文档选择器(含 `*`)不跨入 shadow tree。

**证据**:
- 截图 `screenshots/test-b-1-before-inject.png` / `test-b-2-after-inject.png` — 视觉对比:主文档 h1/h2/主区文字全红 · 组件内部 tab cur 仍紫 · 面板内文字仍白
- 浏览器 console `B-2 shadow .tab.cur color = rgb(167, 139, 250) | main <h1> color = rgb(255, 0, 0)`

### 测试 C · `:host([kind])` 属性选择器 [PASS]

| host attribute | stripe 计算 background | token | 期望 |
|---|---|---|---|
| `<nf-track kind="scene">` | `rgb(167, 139, 250)` | `--accent` | PASS |
| `<nf-track kind="text">` | `rgb(224, 183, 108)` | `--amber` | PASS |
| `<nf-track kind="audio">` | `rgb(123, 201, 181)` | `--teal` | PASS |

3 host attribute 切 3 color · `:host([kind=xxx])` 作用 shadow 内 `.stripe` 命中 · 一次渲染即切 · 无 JS 辅助。

**证据**:截图 `screenshots/test-c-3-stripes.png` — 3 条 stripe 依次紫 / 琥珀 / 青

### 测试 D · adoptedStyleSheets vs inline `<style>` [PASS]

3 轮 n=100 + n=10 / 500:

| n (组件数) | inline `<style>` ms | adoptedStyleSheets ms | ratio (inline/adopted) |
|---|---|---|---|
| 10  | 2.4  | 0.3  | 8.00x |
| 100 | 3.0  | 1.5  | 2.00x |
| 100 | 2.9  | 1.6  | 1.81x |
| 100 | 2.7  | 1.5  | 1.80x |
| 500 | 14.0 | 7.8  | 1.79x |

**结论**:n=100 规模下 adoptedStyleSheets **快 ~1.8-2.0x** · 随 n 上升优势维持 ~1.8x 稳定(因 inline 每组件都 parse 一次 CSS · adopted 只 parse 一次复用)。切 `--accent` 后 repaint `0-0.8ms`(async paint outside measure window) · 两方案都零额外成本。

**证据**:截图 `screenshots/test-d-perf.png` + 原始数据 `results.json` §D.runs

**浏览器支持**:Chromium 73+ / WebKit 16.4+ / Firefox 101+(Safari 16.4 落地 · v0.2 目标桌面 Chromium / WebKit 都覆盖)。v0.2 组件数预期 <= 20 · 两方案性能都远远够用 · 选 adoptedStyleSheets 主要为**代码减量 + 单一 parse**。

## 产物

```
opus/
├── report.md                         <- 本文
├── results.json                      <- 原始数字
├── src/
│   ├── package.json / tsconfig.json
│   ├── tokens.css                    <- :root vars 本地镜像(从 spec/design/tokens.css)
│   ├── index.html                    <- 测试页(4 测试按钮 + HUD)
│   ├── index.ts                      <- window.__POC__ harness
│   ├── components/
│   │   ├── nf-demo.ts                <- inline <style> 方案 · 测 A/B
│   │   ├── nf-track.ts               <- :host([kind]) 属性选择器 · 测 C
│   │   └── nf-perf.ts                <- adoptedStyleSheets 方案 · 测 D
│   └── run-tests.mjs                 <- playwright headless 跑手(含 tiny HTTP server)
├── dist/
│   └── index.js                      <- esbuild bundle · 5.9 KB
└── screenshots/                      <- 6 张 PNG · before/after 对比
    ├── test-a-1-initial-purple.png
    ├── test-a-2-flipped-red.png
    ├── test-b-1-before-inject.png
    ├── test-b-2-after-inject.png
    ├── test-c-3-stripes.png
    └── test-d-perf.png
```

## 复现(2 条命令)

```bash
cd spec/poc/P-03-wc-tokens/opus/src
npm install && npm run build
node run-tests.mjs   # playwright headless · 跑 4 测试 + 截图 + 写 results.json
```

## 建议 build 方案

### 1. 组件基类模板

```ts
// src/frontend/components/_base.ts
export abstract class NfBase extends HTMLElement {
  protected root: ShadowRoot;

  constructor(componentSheet: CSSStyleSheet) {
    super();
    this.root = this.attachShadow({ mode: "open" });
    // 组件自己的 CSS · :root tokens 天然穿透 · 不用显式挂
    this.root.adoptedStyleSheets = [componentSheet];
  }
}

// 每组件
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  :host { display: block; box-sizing: border-box; border-radius: 0; }
  .box { background: var(--accent); color: var(--fg); }
  :host([kind="scene"]) .stripe { background: var(--accent); }
`);

export class NfTrack extends NfBase {
  constructor() {
    super(sheet);
    this.root.innerHTML = `<span class="stripe"></span><slot></slot>`;
  }
}
customElements.define("nf-track", NfTrack);
```

### 2. tokens 挂载方式(推荐)

**挂 `:root` on main document · shadow 组件用 `var(--*)` 即可**(不需要每组件 import tokens sheet)。

理由:
- **简单**:主 `<link rel=stylesheet href=tokens.css>` 一次 · 所有 shadow 自动继承 · 零配置。
- **穿透验过**:测试 A · 改 `:root` 瞬时联动所有 shadow · 不需要重建 sheet。
- **主题切换**:v0.2 若做亮 / 暗主题 · 只动 `:root` 下一层 class(如 `:root.dark { --bg: #0a0a0d }`) · 所有组件联动 · 零代码改。

**备选(不推)**:每组件 `adoptedStyleSheets` 挂一份 tokens sheet —— 如果 tokens 修改需要组件各自 replaceSync · 复杂无收益。

### 3. adoptedStyleSheets 用法(推荐)

**每组件类有一份组件自己的 `CSSStyleSheet`(module-level 单例) · 所有实例共享**:

- 10 实例只 parse 1 次 CSS(vs inline 每实例 parse 一次)
- 性能 n=100 快 1.8-2x · n=500 快 1.79x · 线性优势
- Chromium 73+ / WebKit 16.4+ / Firefox 101+ 全桌面浏览器覆盖(v0.2 OK)
- 代码减量:组件 constructor 不再塞巨长 `innerHTML` 的 `<style>` 段

### 4. 对 v0.2 BDD scenarios 的影响

| scenario | POC 影响 |
|---|---|
| S-07 视觉(玻璃 panel) | tokens 穿透 OK · `nf-glass-panel` 可写 `:host` 样式 |
| S-08 视觉(4 轨色) | `:host([kind])` OK · 3 色用 attr 切 |
| S-09 视觉(font stack) | `var(--font) / var(--mono)` 穿透 OK |
| S-10 视觉(直角风) | `*, *::before, *::after { border-radius: 0 }` 不跨 shadow · 解法:基类 sheet 默认塞 reset 条 |
| S-11 视觉(aurora bg) | main body 层 · 不进组件 · 无影响 |
| S-12 架构(组件边界) | OK 样式隔离实锤 |
| S-13 架构(tokens 统一源) | OK 一份 tokens.css 所有组件通 |
| S-14 架构(dev 热改) | OK 改 :root 即时生效 · dev loop 顺 |

**S-10 注意**:直角风 reset(`border-radius: 0`) 不跨 shadow · 解法 -> 组件基类 sheet 默认塞 `:host, *, *::before, *::after { box-sizing: border-box; border-radius: 0 }`,所有组件继承基类即可。

### 5. 风险 / 注意

- **FOUC(无样式闪烁)**:主 `<link rel=stylesheet>` 异步加载 · 组件比 tokens.css 先到会用 fallback 色(我们在 nf-demo.ts 给了 `var(--bd, #444)` fallback 但更好做法是 tokens.css 在 `<head>` 早 preload + `<link rel=preload as=style>`)。v0.2 build 配。
- **Firefox adoptedStyleSheets < 101** 需 polyfill · 但 v0.2 目标 Chromium/WebKit 主机 · 无需。
- **CSSOM 多份 sheet 跨 window** 有 constructor scope 限制 · 本 POC 同 window · 无问题。
