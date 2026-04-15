# Step 1 · 审美约束 + 动画契约

吸收 5 位顶级创作者 DNA + 12 动画原则。

## 1 · 对标参考（每个组件前必看）

| 创作者 | 学什么 | 用在哪 |
|--------|--------|--------|
| **小Lin说** | 信息卡片墙、图标+文字组合、高密度但干净 | content-cards |
| **Kurzgesagt** | 扁平矢量插画、平滑变形、电影配色 | bg-scene、illustration |
| **Vox** | 数据动画、分步展开信息图、手绘质感 | data 可视化 |
| **3Blue1Brown** | 概念动画化、公式是结论不是起点 | metric 大数字 |
| **Fireship** | 100 秒密度、meme 记忆锚、一句话定义 | 金句、设定 |
| **StatQuest** | BAM 时刻、情绪锚点、手绘温度 | walkthrough 节奏 |

**做前先问**："我这个组件在这 6 位身上像哪一位？" 没答案 → 回 step 0 重选。

---

## 2 · 配色（从 theme.md 取，不自己编）

每 theme 都有 6-10 个锁定 hex：

```
主背景 --bg          占画面 80%+
二级面板 --bg2       卡片底色
主文字 --ink         标题/正文 100%
次文字 --ink-75      辅助 (>= 70% 透明度)
辅助 --ink-50        说明文字
主强调 --ac          唯一强调色（标题/按钮/高亮）
二级强调 --gold      引用/徽章
成功 --green / 信息 --blue / 错误 --red  语义色
```

### 硬规则

- 一画面**最多 3 种语义色**（背景不算），强调色只给关键信息
- **不撞色**：暗底不用暗色文字
- **写死 hex** 在组件文件，不 import token（改色用 sed 批处理）
- **文字透明度 5 级梯队**：100% / 55% / 25% / 10% / 4%

---

## 3 · 字号（7 级阶梯，跳级选）

| 级别 | px | 字体 | 用途 |
|------|----|------|------|
| **display** | 120-320 | serif 400 | metric 大数字 / question 大字 |
| **headline** | 72-96 | serif 400 italic | setup / reveal 主标题 |
| **title** | 48-56 | serif 500 | walkthrough / annotate 副标题 |
| **body** | 22-28 | sans 400 | 正文 / 副标 |
| **label** | 14-18 | mono 500 UPPERCASE | eyebrow / header / 标签 |
| **caption** | 13-16 | mono 500 | 出处 / 脚注 |
| **mini** | 11-12 | mono 400 | dim-nav 数字 / 版权 |

**跨级选**，不用中间值。**字体 3 族分工固定**：
- **serif** 只给 display 大数字 + headline italic + 金句
- **mono** 只给 label + 代码 + 路径 + 脚注
- **sans** 管其他

---

## 4 · 留白 + 布局（60% 铁律）

- **70% 以上画面是空的** — 内容不超过 40% 面积
- **padding ≥ 140px top/bottom**（横屏）/ 96px 左右
- **文字距边 ≥ 80px**
- **文字块 max-width ≤ 720px**（body）/ 1400px（headline）
- **同级元素必须对齐** — 左/右/中三选一

### 9x16 竖屏区域

```
┌─────────┐ 0
│  安全  │ 顶 80px 留白
├─────────┤ 80
│  chrome │ 顶条 168px（头像/来源/集数）
├─────────┤ 248
│         │
│ content │ 主内容 1200px 高
│         │
├─────────┤ 1448
│  sub    │ 字幕带 320px
├─────────┤ 1768
│  foot   │ 底条 152px（进度/品牌）
└─────────┘ 1920
```

### 16x9 横屏区域（A/B/C/D/E 五段）

```
┌─────────────────────────────────┐ 0
│  A 顶部留白 40px                │
├─────────────────────────────────┤ 40
│  B 标题栏 50px                  │
├─────────────────────────────────┤ 90
│                                 │
│  C 内容区 ~830px  左右各 60 pad │
│                                 │
├─────────────────────────────────┤ 920
│  D 底部栏 80px（进度+字幕+品牌）│
├─────────────────────────────────┤ 1000
│  E 底部留白 80px                │
└─────────────────────────────────┘ 1080
```

**A/E 不放任何内容**（会被平台 UI 覆盖）。

---

## 5 · 动画（12 原则简化版）

### 5.1 运动规则

| 规则 | 做法 |
|------|------|
| **Easing** | 唯一缓动 `cubic-bezier(0.16, 1, 0.3, 1)`，禁 linear |
| **Stagger** | 多元素递进入场，间隔 120-180ms |
| **只两种属性** | `opacity` + `transform`（translateY / scale）。禁 left/top/width |
| **时长** | 进场 0.5-0.8s，退场 0.3-0.5s，场景切 0.6-1.0s |
| **呼吸感** | 静态元素加 2-4s 微脉冲（opacity 0.7↔1.0 或 scale 0.98↔1.02）|

### 5.2 入场 6 种 verb（选 1-2 个组合）

| verb | 效果 | 用在 |
|------|------|------|
| `fadeUp` | opacity + translateY 20→0 | 卡片、列表项 |
| `stagger` | 多元素递进 150ms | 要点列表、pill tags |
| `clipReveal` | 从左到右 clip-path 擦入 | 标题、进度条 |
| `counter` | 数字从 0 滚到目标 | metric 大数字 |
| `drawLine` | SVG path dasharray 画出 | 节点连线、箭头 |
| `blurClear` | filter: blur(10px)→0 | 设定帧、大字开场 |

### 5.3 禁止清单

- ❌ 禁 `box-shadow`（用极淡边框 + radial-gradient 微光）
- ❌ 禁 `rotate / skew`（不是卡通动画）
- ❌ 禁 `bounce`（过于儿童）
- ❌ 禁超过 3 个元素同时动
- ❌ 禁静止 > 3 秒（否则像 404）
- ❌ 禁 `transition:` 代替主动画（要 CSS `animation: name 0.6s var(--ease) both`）

### 5.4 DOM 组件的 CSS 动画落法

render 内 innerHTML 里写 inline CSS + `@keyframes`：

```js
render(host, _t, params, vp) {
  host.innerHTML = `
    <style>
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(24px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .card {
        opacity: 0;
        animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s both;
      }
      .item { animation: fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both; }
      .item:nth-child(1) { animation-delay: 0.3s; }
      .item:nth-child(2) { animation-delay: 0.45s; }
      .item:nth-child(3) { animation-delay: 0.6s; }
    </style>
    <div class="card">
      <div class="item">...</div>
      <div class="item">...</div>
      <div class="item">...</div>
    </div>
  `;
}
```

入场动画**只在第一次 render 时跑**（CSS animation 默认 `forwards`）。后续帧 compose 再调 render 时 host 被 innerHTML 重置，动画会重播 — 这在视频里不可接受。

**解决**：render 检查 t 范围，只在 `t < enter_dur` 时重写 innerHTML；之后原样保留。

```js
render(host, t, params, vp) {
  if (host._rendered && t > 0.8) return;   // 已渲染且过了入场时段
  host._rendered = true;
  host.innerHTML = `...动画 HTML...`;
}
```

### 5.5 t-driven 动画（数字 counter / 进度条）

数字从 0 → N 用 t 驱动：

```js
render(host, t, params, vp) {
  const target = params.value || 87;
  const dur = 1.2;
  const prog = Math.min(t / dur, 1);
  const eased = 1 - Math.pow(1 - prog, 3);  // easeOut cubic
  const current = Math.round(target * eased);
  host.innerHTML = `<div class="big">${current}</div>`;
}
```

---

## 6 · 音画同步（只在有音频时）

每 3-5 秒画面必须有变化：

| 语音事件 | 画面响应 |
|----------|---------|
| 提到名词 | 对应图标/logo 出现 |
| 说数字 | 数字大字 + 数据可视化 |
| 语气转折（但是...） | 场景切换 |
| 金句/重点 | 大字 + 强调色 |
| 停顿 | 画面微动（脉冲） |
| 列举 A、B、C | 逐个 stagger 出现 |

## 下一步

吃透这 6 节 → `cargo run -p nf-guide -- component craft`
