# NextFrame v0.4 — Design System

> 所有页面、组件、原型必须遵守。不符合 = 不合格。

## 设计理念

- **工作台，不是展厅** — 信息密度高，但不拥挤
- **Linear/Vercel 风格** — 极简、精确、克制
- **纯黑底 + 紫色主调** — 一个强调色做尽所有事
- **可读性第一** — 最小字号 11px，灰色文字必须可读（≥50% 透明度）
- **纯展示** — 不做交互按钮，所有操作走 CLI

---

## 色板（硬性规定）

### 背景层级

| 变量 | 值 | 用途 |
|------|-----|------|
| `--bg` | `#0a0a0c` | 页面底色 |
| `--surface` | `#111114` | 面板/侧边栏底色 |
| `--card` | `#161619` | 卡片/行底色 |

### 强调色（唯一）

| 变量 | 值 | 用途 |
|------|-----|------|
| `--accent` | `#7c6aef` | 主强调色，选中态、活跃 Tab |
| `--accent-15` | `rgba(124,106,239,0.15)` | 标签/高亮区域底色 |
| `--accent-06` | `rgba(124,106,239,0.06)` | 轻微强调底色 |
| `--accent-03` | `rgba(124,106,239,0.03)` | 极浅选中态底色 |

### 语义色

| 变量 | 值 | 用途 |
|------|-----|------|
| `--green` | `#3eb370` | 成功/已完成/帧率标签 |
| `--yellow` | `#e0a040` | 字幕/编码标签/警告 |

禁止使用其他颜色。红色仅限播放头（`#e04050`）。

### 文字透明度（5 级）

| 变量 | 实际值 | 用途 | 最小字号 |
|------|--------|------|---------|
| `--ink` | `#e4e4e8` (100%) | 标题、名称、主要内容 | 13px |
| `--ink-55` | `rgba(228,228,232,0.75)` | 次要文字、描述、路径 | 11px |
| `--ink-25` | `rgba(228,228,232,0.50)` | 辅助信息、时码、标签 | 11px |
| `--ink-08` | `rgba(228,228,232,0.10)` | 边框、分隔线、hover 底色 | — |
| `--ink-03` | `rgba(228,228,232,0.05)` | 极浅底色、卡片 hover | — |

**禁止低于 50% 透明度的文字。** 之前的 25%/55% 看不清，已修正。

### 边框

```css
--border: 1px solid rgba(255,255,255,0.06);
/* hover 态 */
border-color: rgba(255,255,255,0.12);
/* 选中态 */
border-color: rgba(124,106,239,0.25);
```

禁止 `box-shadow`。一律用 `1px solid` 边框。

---

## 字体（硬性规定）

| 变量 | 值 | 用途 |
|------|-----|------|
| `--sans` | `-apple-system, 'Helvetica Neue', system-ui, sans-serif` | 正文、标签、按钮 |
| `--serif` | `Georgia, 'Times New Roman', serif` | 品牌名 "NextFrame"、大标题 |
| `--mono` | `'SF Mono', 'Cascadia Code', Menlo, monospace` | 时码、路径、数据值、代码 |

---

## 字号（硬性规定）

| 层级 | 字号 | 字重 | 用途 |
|------|------|------|------|
| H1 | 16px | 500 | 页面主标题（源文件名、模块名） |
| H2 | 14px | 500 | 卡片标题、clip 名称 |
| Body | 13px | 400 | 正文、列表项、下拉选项 |
| Label | 12px | 400 | 描述、路径、面包屑 |
| Caption | 11px | 400-500 | 标签、标注、状态、时码、小标签 |

**最小字号 11px。禁止 10px 及以下。**

Section 标题（如 "SOURCES"）：12px, uppercase, letter-spacing 0.08em, `--ink-55`

---

## 标签系统（spec-tag）

参数/状态用彩色标签展示：

| 类型 | 底色 | 文字色 | 边框 |
|------|------|--------|------|
| 分辨率 | `rgba(124,106,239,0.1)` | `--accent` | `rgba(124,106,239,0.15)` |
| 帧率 | `rgba(62,179,112,0.1)` | `--green` | `rgba(62,179,112,0.15)` |
| 编码 | `rgba(224,160,64,0.1)` | `--yellow` | `rgba(224,160,64,0.15)` |
| 时长 | `--ink-08` | `--ink` | — |
| 大小 | `--ink-08` | `--ink-55` | — |
| 状态-是 | 对应语义色 12% | 对应语义色 | — |
| 状态-否 | `--ink-08` | `--ink-25` | — |

标签尺寸：`font-size: 11px; padding: 2px 10px; border-radius: 3px;`

状态标签示例：
- `字幕 ✓` — 黄底
- `无字幕` — 灰底
- `时间轴 ✓` — 紫底
- `段2` — 紫底 mono 字体

---

## 布局规则

### Topbar（48px）

```
[Logo serif] / [Project ▾] / [Episode ▾] | Tab Tab Tab Tab Tab Tab     [EN] [⚙] [Z]
```

- Logo：`--serif`, 15px
- 面包屑下拉：Vercel 风格，13px，hover 展开
- 竖线分隔符：`1px, rgba(255,255,255,0.1), height 20px, margin 0 12px`
- Tab：13px，active = `--ink` + 底部 2px `--accent`，inactive = `--ink-55`
- 右侧推到最右（`margin-left: auto`）

### 侧边栏

- 宽度：280px
- Header：12px uppercase `--ink-55`
- 列表项：缩略图 16:9 + info 区（名称 13px + meta 11px mono + badge）
- 选中态：`border-color: rgba(124,106,239,0.25); background: var(--accent-03)`

### 详情面板

- 路径放在面板最底部，mono 11px `--ink-55`
- 预览区：16:9，`#050508` 底色，一个 ▶ 居中，角落 ⛶ 放大按钮
- 信息用 key-value 网格：label 10px uppercase `--ink-25`，value 13px mono `--ink`

---

## 动画

| 规则 | 值 |
|------|-----|
| 全局缓动 | `cubic-bezier(0.16, 1, 0.3, 1)` |
| 只用 | `opacity` + `transform` |
| 禁止 | layout 属性动画、`ease`、`linear` |
| Stagger | 0.08s 递增 |
| 过渡时长 | 0.2s-0.3s |

---

## 纹理

Film grain 必须包含：
```html
<svg style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;opacity:0.03;z-index:9999;mix-blend-mode:overlay">
  <filter id="grain"><feTurbulence baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/></filter>
  <rect width="100%" height="100%" filter="url(#grain)"/>
</svg>
```

---

## 播放模式

所有视频（源/clip）统一两种播放：

| 操作 | 触发 | 效果 |
|------|------|------|
| ▶ 点击缩略图 | 小窗播放 | 原位播放，底部进度条走动 |
| ⛶ 角落按钮 | 全屏弹窗 | 弹出 modal，大画面 + 控件 |

⛶ 按钮 hover 才显示（opacity 0 → 1）。

---

## CSS 变量模板

每个页面直接复制：

```css
:root {
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --accent: #7c6aef;
  --accent-15: rgba(124,106,239,0.15);
  --accent-06: rgba(124,106,239,0.06);
  --accent-03: rgba(124,106,239,0.03);
  --bg: #0a0a0c;
  --surface: #111114;
  --card: #161619;
  --ink: #e4e4e8;
  --ink-55: rgba(228,228,232,0.75);
  --ink-25: rgba(228,228,232,0.50);
  --ink-08: rgba(228,228,232,0.10);
  --ink-03: rgba(228,228,232,0.05);
  --border: 1px solid rgba(255,255,255,0.06);
  --mono: 'SF Mono', 'Cascadia Code', Menlo, monospace;
  --sans: -apple-system, 'Helvetica Neue', system-ui, sans-serif;
  --serif: Georgia, 'Times New Roman', serif;
  --green: #3eb370;
  --yellow: #e0a040;
}
```

---

## 禁止清单

- 禁止 `box-shadow`
- 禁止字号 < 11px
- 禁止文字透明度 < 50%
- 禁止 `ease` / `linear` 缓动
- 禁止第三个强调色（只有 purple + green + yellow）
- 禁止 layout 属性动画
- 禁止复杂 SVG（> 10 paths）
- 禁止圆角 > 8px（卡片最大 8px，标签 3-4px）
