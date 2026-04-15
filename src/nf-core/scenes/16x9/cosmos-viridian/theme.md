# cosmos-viridian · 16:9

> 设计语言文档。AI 写组件前必读。**代码不 import 此文件** — 所有值在组件文件里写死，改 token 用 sed 批处理。

---

## 气质

深空观测站 · 靛紫夜幕 · 翠青辉光。
配科普宇宙 / 量子物理 / 深空天文 / 前沿物理类视频（对标 Kurzgesagt × Veritasium × Vox）。
**好奇 + 敬畏 + 希望** 三重情绪并存。不恐怖（不是 Black Mirror），不可爱（不是儿童动画），不冷漠（不是纯 sci-fi）。

参考：
- Kurzgesagt 《What's Inside A Black Hole?》封面的深紫 + 青绿辉光
- Event Horizon Telescope 2019 黑洞照片的橙环对比深紫背景
- Webb Telescope 色调映射（靛紫深空 + 青绿星云）
- Veritasium 公式板书的极细等宽字

---

## 配色（直接 hex 写到组件里）

### 背景层（深靛紫夜幕）
- `--bg`     `#0a0b1e`  主背景（深靛 / 接近黑但偏紫）
- `--bg2`    `#12132a`  二级面板（卡片 / section）
- `--bg3`    `#1a1b3a`  三级表面（嵌套）
- `--bg-in`  `#06071a`  inset 更深（公式框 / 代码块）

### 文字（冰白系，带一丝青）
- `--ink`     `#eaf4f2`                    主文字（标题 / 正文）
- `--ink-75`  `rgba(234,244,242,.75)`      次文字
- `--ink-50`  `rgba(234,244,242,.50)`      辅助文字
- `--ink-25`  `rgba(234,244,242,.25)`      脚注 / 占位
- `--ink-10`  `rgba(234,244,242,.10)`      幽灵文字（装饰数字）

### 主调（翠青 viridian）+ 辅助（辉光紫）
- `--ac`     `#3ddc97`  **主强调**（翠青 / 关键词 / 进度 / 数字）
- `--ac2`    `#b967ff`  **次强调**（辉光紫 / 公式 / 章节号）
- `--gold`   `#f3b95f`  温暖强调（警示 / 观测事件 / 时间节点）
- `--blue`   `#5fb5ff`  冷信息（链接 / 坐标 / 数据）
- `--red`    `#ff6b8b`  错误 / 反常识 / 警告
- `--star`   `#fffbd6`  星点色（几乎白，带一丝暖）

### 透明度变体
- `--ac-08`    `rgba(61,220,151,.08)`
- `--ac-20`    `rgba(61,220,151,.20)`
- `--ac-40`    `rgba(61,220,151,.40)`
- `--ac2-12`   `rgba(185,103,255,.12)`
- `--ac2-25`   `rgba(185,103,255,.25)`
- `--gold-12`  `rgba(243,185,95,.12)`

### 分割线 / 幽灵 / 辉光
- `--rule`   `rgba(234,244,242,.10)`
- `--rule2`  `rgba(234,244,242,.16)`
- `--ghost`  `rgba(234,244,242,.05)`
- `--glow-ac`  `0 0 24px rgba(61,220,151,.45)`   组件里直接写 box-shadow
- `--glow-ac2` `0 0 32px rgba(185,103,255,.40)`

**硬规则**
- 一画面最多 3 种语义色（背景不算）。`--ac` 优先，`--ac2` 只给"公式/章节/次级强调"。
- `--ac`（翠青）和 `--ac2`（辉光紫）可同屏，但比例不超 70/30，不对等。
- 暗底禁用深色文字。主文字必须 `--ink`（≥ 90% 对比度）。

---

## 字体

| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `system-ui, -apple-system, 'Inter', 'PingFang SC', sans-serif` | UI / 标题 / 正文 |
| serif | `'Times New Roman', 'Hiragino Mincho ProN', 'Noto Serif SC', serif` | 大数字 / 公式变量 / 诗意金句 |
| mono | `'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, monospace` | 坐标 / 公式 / 天体编号 / 数据 |

**禁止外部字体下载** — `assets:[]` 必须为空。

**字族分工铁律**
- serif 只出现在：display 大数字 / 公式中的变量（M、R、c、ℏ）/ italic 金句
- mono 只出现在：label / 数据 / 坐标（RA 14h29m / Dec -62°40'）/ 天体编号（M87*）
- sans 是默认，其他所有都归它

---

## 字号阶梯（1920×1080）

| 用途 | px | 行高 | 字重 |
|------|----|------|------|
| Display 大数字 | 260 | 0.9 | serif 400 |
| H1 主标题 | 88 | 1.1 | sans 600 |
| H2 章节 | 60 | 1.2 | sans 600 |
| H3 卡片 | 38 | 1.3 | sans 600 |
| Body 大 | 34 | 1.55 | sans 400 |
| Body | 26 | 1.6 | sans 400 |
| Caption | 20 | 1.4 | mono 500 |
| Mini | 14 | 1.3 | mono 400 |

**跨级选，不用中间值。** Display 和 H1 之间没有"大点的 H1"这种东西。

字母间距：
- Display serif: `-0.02em`
- H1/H2 sans: `-0.01em`
- mono label: `+0.18em` UPPERCASE
- mono data: `+0.04em`（不大写）

---

## 网格（1920×1080）

- 安全边距 上/下/左/右：80 / 80 / 96 / 96
- A 顶部留白：y 0 → 40（平台 UI 覆盖区，严禁放内容）
- B 标题栏（chrome-top）：y 40 → 120（章节号 + 时间戳）
- C 主内容区：y 120 → 960（840px 高 × 1728px 宽）
- D 底部栏（chrome-bottom）：y 960 → 1040（进度 + 字幕带 + 品牌）
- E 底部留白：y 1040 → 1080（平台 UI 覆盖区）

主内容区中心点：(960, 540)。
卡片 max-width：1400。
文字块 body max-width：820（不超过 43% 画面宽，保持可读）。

对齐规则：同级元素只允许左/右/中三选一。**禁止"大致对齐"**。

---

## 图层顺序（z 从下到上）

| 层 | role | 典型组件 | 互斥 |
|------|------|----------|------|
| 1 bg | `bg` | `bg-voidField`（星空 + 辉光）| 同屏只一个 bg |
| 2 content | `content` | `content-orbitDiagram` / `content-formulaReveal` | 可多个但不重叠 |
| 3 data | `data` | `data-cosmicCounter`（大数字）| 同屏只一个 data-主 |
| 4 text | `text` | `text-awelineQuote`（金句）| 与 data-主不同屏 |
| 5 chrome | `chrome` | 顶/底条 | 每条只一个 |
| 6 overlay | `overlay` | 进度脉冲 / 字幕 | |

---

## 命名约定

- 文件：`{role}-{camelName}.js`
- `id` = camelCase，和文件名中 camelName 相同
- 示例：`bg-voidField.js` → `id: "voidField"`

---

## 组件设计原则（铁律）

1. **零 import** — 每个组件是完全独立文件，hex / 字号 / 坐标从本文档复制写死
2. **frame_pure: false** — 所有组件都有 t-driven 动画，禁 CSS `@keyframes`（compose 每帧新建 host，@keyframes 永不完成 — pit 1）
3. **viewport-relative** — 用 `vp.width / vp.height`，不硬编码 1920/1080，保证缩放正确
4. **18 个 AI 理解字段必填** — intent ≥ 80 字，真实推理，不套话
5. **assets: []** — 纯系统字体，零外部依赖
6. **每组件 ≥ 2 种动效 verb** — 从 pop/reveal/fly/unfold/counter/type/zoom/pulse/breathe/shake/glitch 选
7. **Hook 3 秒法则** — 第一个出场的元素必须有冲击感（pop 或 reveal，不只是 fade）
8. **静止不超过 3s** — 入场完成后必须有"呼吸"动画（breathe / pulse 循环）

---

## 动画公式（抄到组件里）

```js
// easeOutCubic
const p = Math.min(Math.max(t / dur, 0), 1);
const eased = 1 - Math.pow(1 - p, 3);

// pop (overshoot)
const pop = p < 0.7 ? (p / 0.7) * 1.1 : 1.1 - ((p - 0.7) / 0.3) * 0.1;

// breathe (循环，入场后)
const breathe = 1 + 0.025 * Math.sin(t * Math.PI);   // scale 0.975~1.025
const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * Math.PI * 0.8));  // opacity

// counter
const target = 1392;
const progress = Math.min(t / 1.4, 1);
const current = Math.round(target * (1 - Math.pow(1 - progress, 3)));

// stagger
const staggerDelay = 0.15;  // 每个元素延迟 150ms
const itemP = Math.min(Math.max((t - i * staggerDelay) / 0.6, 0), 1);
```

easing 统一 cubic-bezier(0.16, 1, 0.3, 1) 的数学形式 = `1 - pow(1-p, 3)`。**禁 linear，禁 bounce。**

---

## 改设计语言时（sed 批处理）

改主强调色从翠青 → 天蓝：
```bash
cd src/nf-core/scenes/16x9/cosmos-viridian
sed -i '' 's/#3ddc97/#5fb5ff/g' *.js
sed -i '' 's/61,220,151/95,181,255/g' *.js
```

改字号阶梯：
```bash
sed -i '' 's/font: 400 260px/font: 400 240px/g' *.js
```

---

## 下一步

theme.md 完 → `nextframe scene-new <name> --ratio=16:9 --category=<cat>` 生成骨架 → 按本文档的 hex / 字号 / 网格 / 动画公式填内容。
