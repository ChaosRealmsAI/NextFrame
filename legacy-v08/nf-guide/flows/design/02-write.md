# Step 2 · 写 theme.md（10 必填字段模板）

把 brief + tokens 落成文档。**下游所有组件的唯一设计真相源**。

## 铁律 · 从样板起步，不从 skeleton 起步

skeleton 是给 AI 看的"10 个字段要填"。样板是"照这个改 3-5 个值就完事"。

**写新 theme 前**：
1. 从下方"样板 1/2"挑一个气质接近的，cp 一份
2. 改 3-5 个字段（主要是配色 + 字号 + 命名前缀）
3. 其他字段沿用（网格 / 动效曲线 / 禁忌规则都是通用的）

**禁止**：从 skeleton 空白从零填（3 小时后你会发现填得不对 + 风格漂移）。

## 路径

`src/nf-core/scenes/{ratio-dir}/{theme}/theme.md` — 例 `src/nf-core/scenes/16x9/blueprint-cinema/theme.md`。目录不存在先 `mkdir -p`。

## 10 必填字段清单（照样板填，别漏）

| # | 字段 | 说明 |
|---|------|------|
| 1 | 气质 | 3-5 个形容词 |
| 2 | 配色 | 严格 5 色 hex（`--bg` / `--ac` / `--ink` / `--ink2` / `--rule`），文字对 bg contrast ≥ 7:1 |
| 3 | 字体 | 2 族（sans + mono 或 sans + display），系统 fallback，禁外部 CDN |
| 4 | 字号 | 4 级阶梯（H1 / H2 / body / cap），含 weight 和行高 |
| 5 | 网格 | 安全边距 + 主内容区坐标（按 ratio 给具体像素） |
| 6 | 图层 | 5 层 z 顺序（bg / content / text / chrome / overlay） |
| 7 | 动效 | easing + stagger + 进场时长，禁 linear / 禁 `@keyframes` |
| 8 | 构图 | 3 条原则（主体位置 + 占比 + 对齐） |
| 9 | 命名 | 文件 / CSS 类前缀 / id 规则 |
| 10 | 禁忌 | 3 条红线（本 theme 专属的） |

**10 段落标题格式必须是 `## N · 字段名`**（`grep -E "^## [0-9]+\s*·"` 要能数出 10 条）。

## 验证

```bash
ls src/nf-core/scenes/{ratio-dir}/{theme}/theme.md                          # 存在
grep -cE "^## [0-9]+\s*·" src/nf-core/scenes/{ratio-dir}/{theme}/theme.md   # = 10
wc -c src/nf-core/scenes/{ratio-dir}/{theme}/theme.md                       # > 500
```

## 样板 1：`blueprint-cinema`（16:9 横屏）

> 照抄这份，改 3-5 个值即可得到新 theme。**不要从 skeleton 从零填**。

```markdown
# blueprint-cinema · 16:9

## 1 · 气质
蓝图电影感 · 工程精密 · 戏剧光影 · 略带科技冷感 · 学术报告

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
| 0 | bg      | bg-blueprintGrid |
| 1 | content | content-codeTerminal |
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
```

---

## 样板 2：`mobile-vertical`（9:16 竖屏）

> 竖屏移动感。字号更大 · 留白更多 · 避开底部评论区。

```markdown
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
```

---

## 下一步

theme.md 写好 → 进 produce / component：

```bash
cargo run -p nf-guide -- produce        # 看 produce 流程
cargo run -p nf-guide -- component      # 造组件
```
