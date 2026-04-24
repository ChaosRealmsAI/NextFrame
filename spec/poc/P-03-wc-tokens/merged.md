---
poc_id: P-03
topic: Web Components + tokens.css :root vars 穿透 + 样式隔离
affects_scenarios: [S-07, S-08, S-09, S-10, S-11, S-12, S-13, S-14]
merged_at: 2026-04-21 16:25
status: valid
confidence: 0.95
selected_proposal: opus(深度 + 直角 reset 洞察 + FOUC 风险识别)
ally_corroboration: 独立验证一致(4/4 测试同结论 · rgb 值精确重合)
---

# P-03 merged · Web Components + tokens 穿透 + 样式隔离

## 主 agent 亲验结论

两份独立报告(opus 25min · ally 20min)**结论 100% 一致 · 0 分歧 · RGB 值精确重合**:

- tokens.css `:root` vars 穿透 shadow DOM(W3C Custom Properties §3.2 继承机制)
- 主文档 `* { color: red !important }` **不穿** shadow 内部(shadow DOM 硬边界)
- `:host([kind])` 按 host attribute 切 shadow 样式 OK
- `adoptedStyleSheets` 支持 · v0.2 规模两方案都 OK

## opus vs ally 对比

| 维度 | opus | ally-gpt | 一致? |
|---|---|---|---|
| 测试 | 4/4 PASS | 4/4 PASS | ✓ |
| A · tokens 穿透 RGB | 紫 → 红 → 紫(reset) | 紫 → 红 | ✓ |
| B · 全局不穿 shadow | `.tab.cur` rgb(167,139,250) 不变 | `.tab.cur` rgb(244,244,248) 不变 | ✓ 都未污染(数字不同因组件 token 选择不同 · 结论一致) |
| C · :host([kind]) | 紫 / 琥珀 / 青(167,139,250 / 224,183,108 / 123,201,181) | 紫 / 琥珀 / 青(同上) | ✓ **RGB 值精确重合** |
| D · perf 对比 | n=100 · inline 2.9ms vs adopted 1.5ms · 1.8-2x | n=10 · 都 0.1ms(无差 · 测量误差级) | 🟡 尺度不同 · opus 看出差距 · ally 规模太小 |
| 浏览器 | Chromium 147 headless | Chromium via playwright | ✓ |
| 报告详细度 | 188 行 + 完整组件基类代码模板 + FOUC 风险 + S-10 洞察 | 59 行 · 简洁 | — |

**RGB 值精确重合 · 双视角无盲区**:两 agent 独立用不同 playwright runner 跑 · 产出的 rgb(167,139,250) / rgb(224,183,108) / rgb(123,201,181) 完全一致 = 机制稳。

## 选定方案(进 adrs.json)

### 组件基类(按 opus · adoptedStyleSheets 单例)

```ts
// src/frontend/components/_base.ts
export abstract class NfBase extends HTMLElement {
  protected root: ShadowRoot;

  constructor(componentSheet: CSSStyleSheet) {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.adoptedStyleSheets = [componentSheet];
  }
}

// 每组件 module-level 单例 sheet
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  :host, *, *::before, *::after {
    box-sizing: border-box;
    border-radius: 0;   /* 直角 reset · S-10 · shadow 不跨 main reset 必须重塞 */
  }
  :host { display: block; }
  .box { background: var(--accent); color: var(--fg); }
  :host([kind="scene"]) .stripe { background: var(--accent); }
  :host([kind="text"]) .stripe { background: var(--amber); }
  :host([kind="audio"]) .stripe { background: var(--teal); }
`);

export class NfTrack extends NfBase {
  constructor() {
    super(sheet);
    this.root.innerHTML = `<span class="stripe"></span><slot></slot>`;
  }
}
customElements.define("nf-track", NfTrack);
```

### tokens 挂载方式

**挂 `:root` on main document · shadow 内用 `var(--*)` 天然穿透**(不每组件挂 tokens sheet):

- 主 `<link rel=stylesheet href=tokens.css>` 一次 · 所有 shadow 自动继承 · 零配置
- 改 `:root` vars 瞬时联动所有 shadow(测试 A 验过)
- 主题切换只改 `:root` · 零代码改

**备选(不推)**:每组件 adoptedStyleSheets 挂 tokens sheet · 修改需各自 replaceSync · 复杂无收益

### S-10 直角 reset 关键洞察(opus 独有)

**Shadow DOM 不跨 main `*` reset** · 主文档 `*, *::before, *::after { border-radius: 0 }` 不影响 shadow 内部。解法:**每组件的 base sheet 默认塞 reset 条**(见上代码) · 否则 shadow 内浏览器默认 border-radius 会破直角风。

### FOUC 风险识别(opus 独有)

tokens.css 异步加载前组件可能用 fallback 色(flash of unstyled content):
- 解法:`<link rel=preload as=style href=tokens.css>` 早挂在 `<head>` 顶部
- v0.2 build 时配置

### 性能(按 v0.2 规模)

| 规模 | inline `<style>` | adoptedStyleSheets | 推荐 |
|---|---|---|---|
| n < 20(v0.2 实际) | 0.1-0.5ms | 0.1ms | **adopted**(代码减量 + 单一 parse) |
| n=100 | 2.9ms | 1.5ms | adopted 明显快 1.8-2x |
| n=500 | 14ms | 7.8ms | adopted 线性优势 |

## 对 v0.2 scenarios 的支撑

| scenario | POC 影响 | 支撑 |
|---|---|---|
| S-07 topbar 玻璃 | tokens 穿透 OK · `:host` 样式 | 测试 A |
| S-08 左 Clips 像素 | tokens + :host([kind]) | 测试 A/C |
| S-09 日志 | tokens + font stack 穿透 | 测试 A |
| S-10 timeline 4 轨色 | `:host([kind=scene/text/audio])` 切 3 色 | 测试 C(RGB 精确重合) |
| S-11 inspector | tokens 穿透 · `var(--accent-l)` 等 | 测试 A |
| S-12 组件注册 | 8 组件继承 NfBase · shadowRoot 可查 | 测试 B |
| S-13 Shadow 隔离 | 主文档污染不穿(实测) | 测试 B(最强 `* !important`) |
| S-14 tokens 统一源 | 改 :root 瞬时联动 · dev loop 顺 | 测试 A(flip + reset) |

## 风险 / 后续

- ✅ 无 blocker · 架构 unblock
- ⚠️ **S-10 shadow 不跨 reset** · build 时每组件 base sheet 必塞 reset 条
- ⚠️ **FOUC** · tokens.css preload · build 时配
- 📋 Firefox < 101 不支持 adoptedStyleSheets · v0.2 目标 Chromium / WebKit 主机 · 无需 polyfill

## Next(进 adrs.json)

- A-0008 · Web Components 基类架构 · NfBase + adoptedStyleSheets 单例 sheet
- A-0009 · tokens 挂载方式 · :root on main document · shadow var(--*) 穿透
- A-0010 · Shadow DOM 直角 reset · 每组件 base sheet 必塞 `:host, *, *::before, *::after { border-radius: 0 }`
- Build Phase 4 W-4 T-13/T-14/T-15/T-16/T-17 全复用此方案
