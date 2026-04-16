# blueprint-cinema · 16:9 · NextFrame 产品介绍

## 1 · 气质
蓝图电影感 · 工程精密 · 戏剧光影 · 略带科技冷感 · 开发者审美

## 2 · 配色（严格 5 色）
- `--bg`    `#0a1628`  主背景（近黑深蓝，不纯黑）
- `--ac`    `#ff6b35`  主强调（橙红 CTA，画面 ≤10%）
- `--ink`   `#f5f2e8`  主文字（暖白，正文）
- `--ink2`  `#8b92a5`  副文字（灰蓝，caption/metadata）
- `--rule`  `rgba(245,242,232,0.10)`  分割线 / 辅蓝代码用 `#58a6ff`

## 3 · 字体（2 族）
| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `Inter, 'PingFang SC', system-ui, sans-serif` | 标题 / 正文 |
| mono | `'JetBrains Mono', 'SF Mono', Menlo, monospace` | 代码 / 数字 |

## 4 · 字号阶梯（1920×1080）
| 用途 | px | weight | 行高 |
|------|----|--------|------|
| H1  | 96 | 700 | 1.1 |
| H2  | 56 | 600 | 1.2 |
| body| 28 | 400 | 1.4 |
| cap | 18 | 400 | 1.3 |

## 5 · 网格
- **安全边距**：左右 96 · 上 40 · 下 80
- **chrome 顶条** y：40 → 90
- **主内容区**：x ∈ [96, 1824] · y ∈ [90, 920]
- **字幕带** y：920 → 1000
- **对齐**：左对齐（学术派），重要数据右对齐

## 6 · 图层顺序（z 从下到上）
| z | role | 例 |
|---|------|----|
| 0 | bg      | bg-grid |
| 1 | content | content-questionHook |
| 2 | text    | text-bigQuote |
| 3 | chrome  | chrome-header |
| 4 | overlay | overlay-spotlight |

## 7 · 动效节奏
- **easing**：`cubic-bezier(0.22, 1, 0.36, 1)` easeOutExpo（进场）/ `cubic-bezier(0.4, 0, 0.2, 1)`（退场）
- **stagger**：120-180ms 多元素递进
- **进场时长**：0.5-0.8s
- **禁** linear / 禁 CSS `@keyframes`

## 8 · 构图原则（3 条）
1. 主标题上三分之一居中（视觉焦点）
2. 数据 / 代码占画面 ≥ 30%（学术派不怕密）
3. 留白 ≥ 25%（呼吸感）

## 9 · 命名
- 文件：`{role}-{name}.js`（role 小写，name camelCase）
- CSS 类前缀：`.bc-{component}`（bc = blueprint-cinema）
- id：camelCase，同 ratio+theme 内唯一

## 10 · 禁忌（3 条）
1. ❌ 禁纯黑 `#000`（用 `#0a1628`）
2. ❌ 禁大色块 > 40% 画面（除 bg 自身）
3. ❌ 禁 Arial / Times / 禁外部 Google Fonts / 禁同屏 >3 色
