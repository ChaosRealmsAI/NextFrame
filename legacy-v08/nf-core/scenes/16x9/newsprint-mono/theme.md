# newsprint-mono · 16:9

## 1 · 气质
报纸印刷感 · 严肃 · 高信息密度 · 黑白分明 · 字符质感 · 深度讲解

## 2 · 配色（严格 5 色）
- `--bg`    `#fafaf7`  主背景（报纸米白，近纸质，非纯白）
- `--ac`    `#c0392b`  主强调（经济学人封面红，CTA / 标签 / 点睛，占画面 ≤8%）
- `--ink`   `#111111`  主文字（近黑，报纸正文严肃感）
- `--ink2`  `#6e6e6e`  副文字（中灰，byline/metadata/caption）
- `--rule`  `rgba(17,17,17,0.12)`  分割线（报纸细线）

## 3 · 字体（2 族 — 主 serif + 副 mono）
| 角色 | 字族 | 用途 |
|------|------|------|
| serif | `'Charter', 'Noto Serif SC', Georgia, 'Songti SC', serif` | 标题 + 正文（报纸感） |
| mono  | `'JetBrains Mono', 'SF Mono', Menlo, monospace` | 代码 / 数字 / 小标签 |

技术讲解选 serif + mono 而非 sans + mono — serif 承担报纸质感。

## 4 · 字号阶梯（1920×1080）
| 用途 | px | weight | 行高 |
|------|----|--------|------|
| H1  | 96 | 700 | 1.1  |
| H2  | 56 | 600 | 1.2  |
| body| 28 | 400 | 1.45 |
| cap | 18 | 400 | 1.3  |

body 行高 1.45（略宽于 blueprint-cinema 的 1.4）— 报纸正文呼吸感。

## 5 · 网格
- **安全边距**：左右 120 · 上 60 · 下 80（左右偏宽，报纸天生留白）
- **chrome 顶条（masthead）** y：60 → 120（报头，含刊名 / 日期）
- **主内容区**：x ∈ [120, 1800] · y ∈ [120, 1000]
- **字幕带** y：1000 → 1080（底部 footer 区）
- **对齐**：左对齐为主（报纸主调），标题居中，数据右对齐

## 6 · 图层顺序（z 从下到上）
| z | role | 例 |
|---|------|----|
| 0 | bg      | bg-newsprintTexture |
| 1 | content | content-columnBlock |
| 2 | text    | text-headline |
| 3 | chrome  | chrome-masthead |
| 4 | overlay | overlay-dropCap |

**互斥**：两个 `bg-*` 不能同屏；`chrome-masthead` 与 `chrome-byline` 可同屏但不同 y 范围。

## 7 · 动效节奏
- **easing**：`cubic-bezier(0.22, 1, 0.36, 1)` easeOutExpo（进场）/ `cubic-bezier(0.4, 0, 0.2, 1)`（退场）
- **stagger**：150-200ms 多元素递进（报纸一行一行"读"的节奏）
- **进场时长**：0.6-0.9s（比品牌类慢一档，严肃感）
- **禁** linear / 禁 CSS `@keyframes`

## 8 · 构图原则（3 条）
1. 标题居中上三分之一 + 正文左对齐（报纸典型版式）
2. 允许双栏正文 ≤ 2 列（报纸 column）；代码/数据块可占宽
3. 红色 `--ac` 全屏占比 ≤ 8%（报纸点睛手法，多了会俗）

## 9 · 命名
- 文件：`{role}-{name}.js`（role 小写，name camelCase）
- CSS 类前缀：`.nm-{component}`（nm = newsprint-mono）
- id：camelCase，同 ratio+theme 内唯一

## 10 · 禁忌（3 条）
1. ❌ 禁任何渐变填充（包括 bg；要质感用噪点 texture）
2. ❌ 禁 sans-serif 做主正文（破坏报纸感）
3. ❌ 禁红色用于正文 / caption（`--ac` 只用于标签、digit highlight、CTA）
