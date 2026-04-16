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

---

## 7 · 短视频平台动感方法论（硬性提升质量）

**对标**：小Lin说、衣戈猜想、Fireship、何同学、李子柒、MKBHD。每一张短视频的视觉都是"可被独立截图传播"的。

### 7.1 Hook 三秒法则

- 第 0 秒 = 最强视觉冲击（大数字 / 反常识对比 / 绝美画面）
- 静态开场 = 观众划走
- 组件放在第一 slide 必须有入场动画（不是淡入，是**冲击感**：放大 + 拉伸 + 高亮闪烁）

### 7.2 节奏感（每帧都不应静止）

| 节奏节点 | 画面必须 |
|---------|--------|
| 0-3s Hook | 大字砸脸 + scale 1.2→1.0 冲击 |
| 3-10s 展开 | 元素分批 stagger 200ms 出场 |
| 10-30s 核心 | 每 3-5s 内容切换 + 局部脉冲 |
| 收尾 3s | 大字金句 + serif italic + 定格 |

**铁律**：单帧静止 > 3s 观众划走。要么换内容，要么加"呼吸动画"（opacity 0.9↔1.0 scale 0.995↔1.005）。

### 7.3 动效词典（替代"淡入淡出"）

单调用 fade 显得 lazy。丰富动效词典：

| verb | 做法 | 场景 |
|------|------|------|
| **pop** | scale 0→1.1→1 弹性过冲 | 大数字 / 按钮出现 |
| **reveal** | clip-path 从中心或边缘擦开 | 标题 / 图片展示 |
| **fly** | translateX/Y 80px → 0 + fade | 卡片入场 |
| **unfold** | clip-path 上到下展开 | 列表 / 时间线 |
| **glitch** | 3 帧位移 + 色散分离 | 技术/赛博气质 |
| **counter** | 数字从 0 滚到目标（非线性） | 统计数字 |
| **type** | 打字机一个字一个字出 | 代码 / 名言 |
| **zoom** | scale 1.08→1 慢推 | 静态图呼吸感 |
| **pulse** | opacity 0.6↔1 循环 2s | 强调字/按钮 |
| **shake** | rotate ±1deg 微抖 0.3s | 提醒 / 警告 |

实现（t-driven）：

```js
// pop 示例
const p = Math.min(t / 0.5, 1);
const overshoot = p < 0.7 ? p * 1.57 : 1.1 - (p - 0.7) * 0.33;  // 0→1.1→1
const scale = 1.1 * overshoot / 1.1;

// zoom 呼吸
const breathe = 1.0 + 0.03 * Math.sin(t * Math.PI);
```

### 7.4 信息密度 — 3B1B/衣戈式

每秒传递的信息量要密：

- 一句话 ≤ 6 秒（别慢悠悠）
- 数字必配对比锚点（"87 类" 孤零零 vs "87 类，ChatGPT 只有 12"）
- 每 slide 留下 1 个观众能截图传播的瞬间

### 7.5 手机端可读性（硬标准）

- **字号下限 42px**（对应 1080 宽 = 手机屏 7%）。低于会被观众滑走。
- **对比度 ≥ 7:1** 主文字 vs 背景（暗底不用深色文字）
- **安全区**：平台 UI 覆盖顶 8% + 底 12% → 主内容放 y=15%～82% 之间
- **主体不靠边**：距左右 ≥ 8% 宽，否则截屏分享露丑

### 7.6 情绪波形（一条视频的曲线）

```
情绪强度
100% ┤    ┌───┐           ┌────┐
 75% ┤    │   │           │    │
 50% ┤────┘   └───┬───┬───┘    └───── 结尾
 25% ┤            │   │
     └─────────────────────────
     0s   3s  8s  15s 20s    最后
     Hook 展开 缓冲 高潮     金句
```

- Hook（0-3s）大冲击
- 展开（3-10s）高信息密度
- 缓冲（10-15s）一张呼吸图
- 高潮（15-25s）核心论点 + 大视觉
- 金句收尾（最后 3s）serif italic 定格

每个组件 intent 字段要写"这组件在情绪波形的哪段用"。

### 7.7 色彩心理（而不是随便涂）

| 情绪 | 色系 | 举例 |
|------|------|------|
| 权威 / 深度 | 深蓝 + 金 | 访谈 / 深度分析 |
| 温度 / 叙事 | 暖棕 + 赤陶 | 讲解 / 教育 |
| 警惕 / 反思 | 深紫 + 红 | 风险警告 |
| 希望 / 科技 | 黑 + 电光蓝 + 荧光绿 | 科技新闻 |
| 怀旧 / 慢 | 乳黄 + 墨绿 | 文艺 / 回忆 |

**theme.md 必选 1 种情绪基调**，tone.md 配合话术风格。

### 7.8 "可截图传播"最后一测

把组件做完问：**这一帧单独截图发微博 / 朋友圈，有人会转吗？**

- 有核心信息（数字 / 金句 / 反常识）？
- 有视觉锚点（大字 / 图标 / 对比）？
- 配色让人一眼记住？
- 无水印也能体现品牌？

不过 = 组件还不够短视频级，重做。

---

## 8 · 图 > 文 铁律（组件设计核心哲学）

**每个组件必须图文并茂，图比文更重要**。人类大脑对图形的识别速度比文字快 6 万倍。纯文字组件 = 失败。

### 8.1 组件类型分布的强制规则

在一个主题的 6-10 个组件里，**必须至少满足**：

| 类型 | 最低占比 | 用什么实现 |
|------|---------|------|
| 带 SVG 图形的组件 | ≥ 30% | 轨道/流程/节点/几何/图标 |
| 带 Canvas 动态的组件 | ≥ 20% | 粒子/星场/波形/渐变 mask/filter |
| 纯 DOM 文字组件 | ≤ 30% | 标题 / 金句 / chrome |
| 数据可视化 | ≥ 10% | SVG 柱/折线/环形 + counter |

纯文字组件 > 50% = 主题质量不及格，重做。

### 8.2 SVG 活用场景（横屏 16:9 / 竖屏 9:16 通用）

**什么时候选 type=svg**：

| 场景 | SVG 做法 | 为什么不是 DOM |
|------|---------|--------------|
| **轨道图 / 天体运动** | `<circle>` + t-driven 位置更新 | CSS 圆形轨道可做但精度差 |
| **流程箭头 / 节点图** | `<path>` + `stroke-dasharray` 绘线动画 | DOM 三角形箭头难做流畅绘制 |
| **柱状图 / 折线图** | `<rect>` / `<path>` + 高度/路径 t-driven | DOM 不方便做数据映射 |
| **抽象几何装饰** | `<polygon>` / `<circle>` + blur filter | DOM 圆形/多边形 CSS 不灵活 |
| **图标矢量** | inline `<path d="...">` | PNG 模糊，DOM CSS 图标有限 |

**必用 SVG 的 4 种组件**：
- `diagram-*`（流程图 / 节点图 / 架构图）
- `chart-*`（柱 / 折线 / 散点 / 环形）
- `orbit-*`（天体 / 轨道 / 运动学）
- `icon-*`（矢量图标）

### 8.3 Canvas 活用场景

**什么时候选 type=canvas**：

| 场景 | Canvas 做法 | 为什么不是 SVG/DOM |
|------|------------|------------------|
| **粒子系统** | `for` 循环画 100+ 小圆/点 + 更新 | DOM 100 个元素卡，SVG 也卡 |
| **星场 / 噪点** | `Math.random` 预填 + 呼吸 | CSS gradient 粒度不够 |
| **波形 / 音频可视化** | 画折线 + requestAnimationFrame | DOM 无法像素级控制 |
| **径向渐变 / 光晕** | `createRadialGradient` | CSS 可做但嵌套复杂 |
| **画笔笔触 / 手绘** | `stroke` + `lineCap='round'` | DOM 不能自由绘制 |
| **像素滤镜** | `getImageData` 操作 | 只有 canvas 能做 |

**必用 Canvas 的 3 种组件**：
- `particle-*`（粒子 / 星场 / 火花）
- `wave-*`（波形 / 脉冲 / 音频可视化）
- `brush-*`（手绘 / 书法 / 水墨）

### 8.4 新 type 的美学红线

| type | 必须做到 | 禁止偷懒 |
|------|---------|---------|
| **shader** | GLSL **至少 20 行**，要有层次、扰动、节奏；优先从成熟 Shadertoy 思路拆结构后重写成 NextFrame fragment | 只写一个 `sin()` + 纯色渐变就交差 |
| **particle** | 至少做出 **near/mid/far 深度分层** + **色温梯度** + **呼吸透明度**，让近景更亮更大更快，远景更冷更淡更慢 | 全部粒子同大小、同颜色、同透明度 |
| **motion** | 优先拼 **behavior 预设 + shape 库 + layers**，让 impact/pulse/dart 这类语义先成立 | 上来手写一长串 keyframe tracks，最后节奏生硬 |

补充要求：
- **shader**：先找成熟视觉母体，再改 uniforms、色板、节奏。不要临场瞎搓 12 行伪 GLSL。
- **particle**：深度至少三层，不然缩略图看起来就是一层死点阵。
- **motion**：只有 behavior 真覆盖不了的局部属性，才补少量显式 track。

### 8.5 持续动画（idle motion）铁律

**每个组件必须有一个 ambient 持续动画**，不能只有入场动画然后静态：

| 组件类型 | 必有的 idle motion | 周期 |
|---------|------------------|------|
| bg | 星点呼吸 / 光斑漂移 / 颗粒扫描 | 3-6s 循环 |
| chrome | 信号灯 pulse / 坐标闪烁 | 1.5-3s |
| content-data | 数字/条柱轻微 pulse | 2s |
| content-diagram | 节点呼吸 / 线条描边移动 | 3-5s |
| text | serif 字体 scale 1.0↔1.005 呼吸 | 4-5s |
| overlay | 端点光 pulse / 指针缓动 | 1-2s |

**实现**：`t` 传入后用 `Math.sin(t * Math.PI * 2 / period)` 做循环：

```js
const breathe = 0.95 + 0.05 * Math.sin(t * Math.PI * 2 / 3);  // 3s 周期
const scanY = (t * 0.1) % 1.2 - 0.1;  // 10s 扫一次
```

**违反 = 单帧静止 > 3s = 观众划走**（见 §7.2）。

### 8.6 自测"图 > 文"

交付前把组件的**所有文字删掉**（在浏览器开发者工具删 text nodes），看剩下的：

- 剩下的图/动画**能撑起一屏**吗？能 → 合格
- 只剩空白 / 几个小方块 → 不合格，重做

**没通过 = 组件本质还是"带 CSS 的文字"，没达到短视频级**。

### 8.7 与其他规则的关系

- §4 视觉主体 ≥ 40% → 8.6 强化为"纯文字不算视觉主体"
- §5 动画 → 8.5 强化为"必须有 idle motion 不只入场"
- §7.3 动效词典 → 8.2/8.3 强化"SVG/Canvas 是一等公民"
