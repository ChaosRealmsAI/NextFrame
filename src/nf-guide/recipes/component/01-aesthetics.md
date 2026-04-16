# Step 1 · 审美约束（读 theme.md · 不 import · 不自编色）

## 0 · 硬前置：必须先读 theme.md

```bash
cat src/nf-core/scenes/{ratio-dir}/{theme}/theme.md
```

**没读 theme.md 就写组件 = 垃圾**。取色 / 字号 / 字体 / 网格必须完全来自这份文档。

- ❌ 禁止 `import { TOKENS }` — theme.md 没给代码 import 的，只给 AI 读
- ❌ 禁止自己造色（看着"好像差不多"随手选 hex）
- ❌ 禁止自造字号（"这里我觉得 32 合适" — 不行）
- ✅ 唯一合规做法：**从 theme.md 拷贝 hex / px 到组件文件里写死**

---

## 1 · 对标参考

| 创作者 | 学什么 | 用在 |
|--------|--------|------|
| 小Lin说 | 高密度信息卡片 | content |
| Kurzgesagt | 扁平矢量 / 电影配色 | bg / 插画 |
| Vox | 数据动画 / 手绘质感 | data |
| 3Blue1Brown | 概念动画化 | metric 大数字 |
| Fireship | 100 秒密度 / 一句话 | 金句 |
| StatQuest | BAM 时刻 / 情绪锚点 | walkthrough |

问自己 "这组件像哪位"，没答案 → 回 step 0。

---

## 2 · 配色（硬规则）

**取色来源唯一**：theme.md 定义的 5 色（bg / ink / ac / 辅助 / 背景变体）。在这 5 色内组合，禁止引入 theme.md 未列的 hex。

```js
// ✅ 正确：从 theme.md 拷贝
const BG = "#0a1628";     // theme.md 里 --bg
const INK = "#f5f2e8";    // theme.md 里 --ink
const ACCENT = "#ff6b35"; // theme.md 里 --ac
host.innerHTML = `<div style="background:${BG};color:${INK};">...</div>`;

// ❌ 反例：import
import { TOKENS } from "../shared/design.js";  // 禁止

// ❌ 反例：自编
host.innerHTML = `<div style="background:#112233;">...</div>`;  // theme.md 没这色
```

**同画面最多 3 种语义色**（背景不算）。主强调色只给关键信息。

---

## 3 · 字号（从 theme.md 的 4 级阶梯选）

每 theme.md 定义 4 级字号（display / title / body / caption）。**写死 px 值，不自造中间尺寸**：

```js
// ✅ 正确：从 theme.md 拷贝
const SIZE_DISPLAY = 180;  // theme.md 里 display 级
const SIZE_TITLE = 64;     // theme.md 里 title 级
const SIZE_BODY = 28;      // theme.md 里 body 级
const SIZE_CAPTION = 16;   // theme.md 里 caption 级

// ❌ 反例：自造
font-size: 42px;  // theme.md 没这级
```

### 字体 3 族分工（theme.md 给定 fallback 字族）

- **serif** 只给 display 大数字 / headline italic / 金句
- **mono** 只给 label / 代码 / 路径 / 脚注
- **sans** 管正文 / 副标 / 大多数场景

系统字体 fallback：`system-ui, -apple-system, 'PingFang SC', sans-serif` / `Georgia, 'Songti SC', serif` / `SF Mono, monospace`。禁 Google Fonts、禁外部下载。

---

## 4 · 留白 + 布局（60% 铁律）

- **70% 以上画面留白** — 内容 ≤ 40% 面积
- **文字距边 ≥ 80px**
- **文字块 max-width**：body ≤ 720px / headline ≤ 1400px
- **同级元素必须对齐** — 左 / 右 / 中三选一

### 16:9（1920×1080）五段

```
A 顶部留白 40px      ← 不放内容
B 标题栏 50px
C 内容区 830px       ← 主战场
D 底部栏 80px（进度 / 字幕 / 品牌）
E 底部留白 80px      ← 不放内容
```

### 9:16（1080×1920）区域

```
安全顶 80px（不放） → chrome 头条 168px → 主内容 1200px → 字幕带 320px → 底条 152px
```

---

## 5 · 动画（12 原则精简版）

| 规则 | 做法 |
|------|------|
| **Easing** | 唯一 `cubic-bezier(0.16, 1, 0.3, 1)` / `cubic-bezier(0.4, 0, 0.2, 1)`，禁 linear（进度条除外） |
| **Stagger** | 多元素递进 120-180ms 间隔 |
| **只两种属性** | `opacity` + `transform`（translateY / scale），禁 left/top/width |
| **时长** | 进场 0.5-0.8s / 退场 0.3-0.5s / 场景切 0.6-1.0s |
| **呼吸感** | 静态元素加 2-4s 微脉冲（opacity 0.7↔1.0 / scale 0.98↔1.02） |

入场 verb：`fadeUp` / `stagger` / `clipReveal` / `counter` / `drawLine` / `blurClear`。

**禁**：`box-shadow` / `rotate` / `skew` / `bounce` / 3+ 同时动 / 静止 > 3s / CSS `@keyframes` 做入场（见 pitfalls 坑 1）。

### ✅ 正确做法：t-driven

```js
render(t, params, vp) {
  const k = Math.min(t / 0.6, 1);
  const eased = 1 - Math.pow(1 - k, 3);  // easeOut cubic
  const opacity = eased;
  const ty = (1 - eased) * 24;
  return `<div style="opacity:${opacity};transform:translateY(${ty}px);...">...</div>`;
}
```

---

## 6 · 图 > 文 铁律

**每个组件必须图文并茂**。纯文字组件 = 失败。

自测：把组件所有文字 hide 掉（dom 里删 text node），剩下的：
- 还能撑起一屏 → ✅
- 只剩空白 / 几个小方块 → ❌ 重做

一个主题 6-10 个组件里：
- ≥ 50% 有图形主体
- ≥ 20% 带持续动态（idle motion）
- ≤ 30% 纯文字（金句 / 大标题）

## 下一步

吃透 → `cargo run -p nf-guide -- component craft`
