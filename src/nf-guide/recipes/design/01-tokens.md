# Step 1: 定 tokens（具体值）

把 brief 里的抽象气质落成 **可以直接写进组件的具体值**。

## 必填清单

### A · 颜色（6-10 个 hex）

| 角色 | 例子 | 说明 |
|------|------|------|
| `bg` 主背景 | `#1a1510` | 占画面 80%+ |
| `bg2` 二级面板 | `#211c15` | 卡片背景 |
| `bg3` 三级表面 | `#2a2319` | 嵌套卡片 |
| `ink` 主文字 | `#f5ece0` | 标题/正文 |
| `ink-75` 次文字 | `rgba(245,236,224,.75)` | 副文字 |
| `ac` 主强调 | `#da7756` | 标题/按钮/高亮 |
| `gold` 二级强调 | `#d4b483` | 引用/徽章 |
| `green` 成功 | `#7ec699` | 通过/新增 |
| `blue` 信息 | `#8ab4cc` | 中性/链接 |
| `red` 错误 | `#e06c75` | 警告/删除 |

**来自参考物**：打开参考视频/页面截图，用取色器取 hex。**不许凭感觉写**。

### B · 字体（3 个字族）

| 角色 | 字族 | 用途 |
|------|------|------|
| sans | `system-ui, -apple-system, 'PingFang SC', sans-serif` | UI / 正文 |
| serif | `Georgia, 'Hiragino Mincho ProN', 'Noto Serif SC', serif` | 引用 / 类比 |
| mono | `'SF Mono', 'JetBrains Mono', Consolas, monospace` | 代码 / 终端 |

**只用系统自带字体**。禁止外部下载 — 会破坏 assets:[] 约束。

### C · 字号阶梯（px @ 基础 viewport）

| 用途 | 建议 px（1920×1080）|
|------|---------------------|
| Display 封面 | 96 |
| H1 主标题 | 72 |
| H2 章节 | 56 |
| H3 卡片 | 40 |
| Body 大 | 36 |
| Body 默认 | 28 |
| Caption | 22 |
| Mono 小/中 | 24 / 28 |

**来自参考物 + 观看距离**：3m 观看，最小 24px；6m 观看，最小 36px。

### D · 网格（pixel-precise）

- 安全边距（左/右/上/下）：例 96 / 96 / 80 / 80
- 主内容区 bounding box：起止坐标
- chrome 顶部条 y 范围
- chrome 底部条 y 范围
- 字幕带 y 范围

**算法**：画布总宽 - 安全边距 × 2 = 可用宽。不要写"居中"这种模糊词 — 要写"x=960"。

### E · 图层顺序（z）

从下到上列出 role：`bg → content → text → chrome → overlay`

声明哪些 role 互斥（比如两个 bg 不能同屏）。

## 验证

| 检查 | 通过 |
|------|------|
| 10 个颜色 hex 都有 | ✓ |
| 3 个字族都全 fallback | ✓ |
| 8 级字号都定 | ✓ |
| 网格具体坐标齐 | ✓ |
| 图层顺序明确 | ✓ |

## 下一步

tokens 全齐 → `cargo run -p nf-guide -- design write`
