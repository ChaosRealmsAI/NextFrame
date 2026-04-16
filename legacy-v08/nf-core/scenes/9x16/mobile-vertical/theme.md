# mobile-vertical · 9:16

## 1 · 气质
移动竖版 · 现代轻盈 · 品牌感 · 清爽留白 · 手机阅读优先

## 2 · 配色（严格 5 色）
- `--bg`    `#ffffff`  主背景（纯白，最大反差）
- `--ac`    `#2563eb`  主强调（品牌蓝，CTA / link）
- `--ink`   `#1f2937`  主文字（近黑，正文 AA 通过）
- `--ink2`  `#6b7280`  副文字（柔灰，caption/metadata）
- `--ac2`   `#3b82f6`  辅蓝（hover / 渐变端点）

## 3 · 字体（2 族，无等宽 — 移动端不流行）
| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `Inter, 'PingFang SC', system-ui, sans-serif` | 全部文本 |
| display | `'PingFang SC', Inter, sans-serif` | 大标题 / 金句 |

## 4 · 字号阶梯（1080×1920）— 比 16:9 大一档
| 用途 | px | weight | 行高 |
|------|----|--------|------|
| H1  | 120 | 700 | 1.1 |
| H2  | 72  | 600 | 1.2 |
| body| 42  | 400 | 1.5 |
| cap | 28  | 400 | 1.3 |

## 5 · 网格（竖屏安全区）
- **顶部安全区**：y 0 → 220（避开状态栏 / 刘海）
- **底部安全区**：y 1720 → 1920（避开评论区 / 点赞栏）
- **主内容区**：x ∈ [64, 1016] · y ∈ [220, 1720]
- **左右边距**：64（占 ~6%）
- **对齐**：居中为主（手机单手扫视）

## 6 · 图层顺序（z 从下到上）
| z | role | 例 |
|---|------|----|
| 0 | bg      | bg-softGradient |
| 1 | content | content-bigCard |
| 2 | text    | text-hookLine |
| 3 | chrome  | chrome-progressBar |
| 4 | overlay | overlay-ctaSticker |

## 7 · 动效节奏
- **easing**：`cubic-bezier(0.22, 1, 0.36, 1)` easeOutExpo（进场）/ `cubic-bezier(0.4, 0, 0.2, 1)`（退场）
- **stagger**：100-150ms
- **进场时长**：0.4-0.6s（移动端要快）
- **禁** linear / 禁 CSS `@keyframes`

## 8 · 构图原则（3 条）
1. 主体居中靠上（y ∈ [400, 1200]），避开底部
2. 单列布局 — 禁 >2 行并排（竖屏看不清）
3. 每屏一个信息点（手机一眼 get）

## 9 · 命名
- 文件：`{role}-{name}.js`
- CSS 类前缀：`.mv-{component}`（mv = mobile-vertical）
- id：camelCase，同 ratio+theme 内唯一

## 10 · 禁忌（3 条）
1. ❌ 禁 >2 行并排（竖屏宽度不够，切成单列）
2. ❌ 禁底部放关键信息（y > 1720 会被 UI 盖住）
3. ❌ 禁 body < 32px（手机看不清）
