# Step 2 · 写 theme.md（10 必填字段模板）

把 brief + tokens 落成文档。**下游所有组件的唯一设计真相源**。

## 路径

```
src/nf-core/scenes/{ratio-dir}/{theme}/theme.md
```

例：16:9 blueprint-cinema → `src/nf-core/scenes/16x9/blueprint-cinema/theme.md`
例：9:16 mobile-vertical → `src/nf-core/scenes/9x16/mobile-vertical/theme.md`

目录不存在先建：

```bash
mkdir -p src/nf-core/scenes/16x9/blueprint-cinema
```

## 10 必填字段（一项不能少）

```markdown
# {theme-name} · {ratio}

> 设计语言文档。AI 写组件前必读。**代码不 import** — 所有值在组件文件里写死。

---

## 1 · 气质（3-5 个形容词）
<!-- 例：深沉 / 专业 / 电影感 / 技术 hud / 蓝图 -->

## 2 · 配色（5 个 hex，必须从参考物取色器取）
- `--bg`    `#0a1628`  主背景
- `--ac`    `#ff6b35`  主强调
- `--ink`   `#f5f2e8`  主文字
- `--bg2`   `#0e1a30`  二级面板 / 卡片背景
- `--rule`  `rgba(245,242,232,0.10)`  分割线 / 高亮底

## 3 · 字体（2 族，系统字体 fallback）
| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `system-ui, -apple-system, 'PingFang SC', sans-serif` | 正文 / 标题 |
| mono | `'SF Mono', 'JetBrains Mono', Consolas, monospace` | 代码 / 脚注 |

<!-- 可选第 3 族 serif（Georgia / Songti SC）给 display 大数字 / 金句 -->

## 4 · 字号阶梯（4 级，跨级选，不造中间尺寸）
| 用途 | 16:9 (1920×1080) | 9:16 (1080×1920) | 行高 |
|------|---|---|------|
| H1  | 96 | 84 | 1.1 |
| H2  | 56 | 48 | 1.2 |
| body| 28 | 36 | 1.4 |
| cap | 16 | 22 | 1.3 |

## 5 · 网格（精确坐标）
- **安全边距**（16:9）：左右 96 · 上 40 · 下 80
- **chrome 顶条** y：40 → 90
- **主内容区**：x ∈ [96, 1824] · y ∈ [90, 920]
- **字幕带** y：920 → 1000

## 6 · 图层顺序（z 从下到上）
| z | role | 例 |
|---|------|----|
| 0 | bg      | bg-blueprintGrid |
| 1 | content | content-codeTerminal |
| 2 | text    | text-bigQuote |
| 3 | chrome  | chrome-header |
| 4 | overlay | overlay-chapterTag |

## 7 · 动效节奏
- **easing**: `cubic-bezier(0.16, 1, 0.3, 1)`（主）/ `cubic-bezier(0.4, 0, 0.2, 1)`（退场）
- **stagger**: 120-180ms 多元素递进
- **进场时长**: 0.5-0.8s
- **idle motion**: 2-4s 呼吸循环

## 8 · 构图原则（3 条）
1. 主体占画面 ≥ 40% — 不留白过度也不塞满
2. 每帧一个视觉主体（12 模式选 1）— 不混杂
3. 同级元素对齐 — 左 / 右 / 中三选一，不乱放

## 9 · 命名约定
- 文件：`{role}-{name}.js`（role 小写，name camelCase）
- id：camelCase，不带 role 前缀
- 全局唯一：同 ratio 同 theme 内 id 不重复

## 10 · 使用禁忌（3 条）
1. ❌ 禁外部字体下载（Google Fonts / CDN）— 破坏 assets: [] 约束
2. ❌ 禁 CSS `@keyframes` / `animation:` 做入场 — compose 重建 DOM 会重置
3. ❌ 禁自造配色 — 所有 hex 只能来自第 2 节定义的 5 色
```

## 参考骨架

```bash
cat src/nf-core/scenes/theme-skeleton.md    # 模板
```

## 参考已有 theme.md

```bash
cat src/nf-core/scenes/16x9/blueprint-cinema/theme.md   # 如存在
cat src/nf-core/scenes/9x16/mobile-vertical/theme.md    # 如存在
```

## 验证

```bash
# 文件存在
ls src/nf-core/scenes/{ratio-dir}/{theme}/theme.md

# 10 段落全齐
grep -E "^## [0-9]+\s*·" src/nf-core/scenes/{ratio-dir}/{theme}/theme.md | wc -l
# 输出 = 10

# 字节数 > 500
wc -c src/nf-core/scenes/{ratio-dir}/{theme}/theme.md
# > 500
```

## 下一步

theme.md 写好 → 进 produce / component：

```bash
cargo run -p nf-guide -- produce        # 看 produce 流程
cargo run -p nf-guide -- component      # 造组件
```
