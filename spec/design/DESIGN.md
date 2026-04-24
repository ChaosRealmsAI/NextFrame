# NextFrame 产品设计系统 · DESIGN.md

**项目唯一产品视觉规范 · 跨版本稳定 · 所有产品类 HTML（hifi / mockup / 真实 app UI）必须遵守**

> 讲解类 HTML（PM 文档 / brief / walkthrough 等）走 `explain-to-pm` skill 的跨项目固定模式 · 不依赖本文件。
>
> 本文件只管**产品视觉** · 让所有 NextFrame 产品界面风格一致 · 不 drift。

---

## 1. 设计理念（Philosophy）

### 1.1 六条底线（跨所有版本不改）

| # | 理念 | 判断尺 |
|---|---|---|
| 1 | **Linear 极简 + Mac 玻璃科技** | 克制 > 炫技 · 玻璃是质感 不是装饰 |
| 2 | **直角风** | 所有 `border-radius: 0` · 例外仅 mac dots / 头像 / 圆点标记 |
| 3 | **单色主调 + 极少点缀** | 紫主 + 琥珀(数字) + 青(音频) + 灰白(文字) · **禁橙红粉绿黄蓝乱用** |
| 4 | **AI 第一用户 · 界面透明化** | CC 操作即时可见 · 日志倒序 · CLI 命令显式 · 不隐藏 |
| 5 | **数字仪器感** | 时间码 / 指标 / warning 用琥珀 · monospace 字体 · 克制发光 |
| 6 | **跨平台 CSS 一致** | system font stack · backdrop-filter + -webkit- · 无 filter drop-shadow 彩色 · 无 conic-gradient |

### 1.2 不做（禁止清单）

- ❌ emoji 表情（`📄 ✂️ 🔊 🎬 🤖 ⚙`）· 用 SVG 线框图标或 unicode 字符代替
- ❌ `border-radius > 0`（除例外）
- ❌ 彩色渐变头像 / 霓虹 glow / 多色 gradient 字
- ❌ "能用版" / MVP 占位 · 第一版就终稿
- ❌ 灰字作主要信息（对比度 < 56% 禁）· label 用紫/琥珀代替灰
- ❌ 依赖 CDN 字体 / 图标库（全零依赖）
- ❌ `filter: drop-shadow(... <color> ...)` 跨 Firefox 不一致

---

## 2. 配色系统（Color）

### 2.1 四色主轴 · 各司其职

| 色 | HEX | 变量 | 用途 |
|---|---|---|---|
| **紫 Purple** | `#a78bfa` | `--accent` | brand · 主操作 · active · 选中 · 锚点 · 主轨道(画面 scene) · AI 标识 |
| **琥珀 Amber** | `#e0b76c` | `--amber` | **数字 / 时间码 / 刻度 / warning / pending / 文字轨 text** |
| **青 Teal** | `#7bc9b5` | `--teal` | 音频轨 audio · 协调冷色 |
| **灰白 Gray scale** | 5 档透明度 | `--fg / --fg-2..4` | 正文 / 次要 / 辅助 / 边框 / 背景 |

### 2.2 辅助色（极少用）

| 色 | 用途 | 场景 |
|---|---|---|
| 绿 `#4ade80` | `--ok` · **仅**在线点 / sync 状态 | `.live-dot` / `.sync` · 不用作强调 |

### 2.3 色彩决策表（什么场景用什么色）

| 场景 | 色 | 为啥 |
|---|---|---|
| 时间码 `00:12.450` | 琥珀 | 仪器感 · 数字读数 |
| ruler 刻度数字 `0 5 10` | 琥珀 70% | 数字统一 |
| 日志时间戳 | 琥珀 75% | 一致 |
| CLI `$` 提示符 | 琥珀 | 强调命令行 |
| pending log 边框/背景 | 琥珀 | warning 语义 |
| active clip / 选中 | 紫 | 品牌 · 焦点 |
| 锚点倒三角 ▲ | 琥珀 | 时间标记 · 数字类 |
| 画面 clip | 紫 40% | 主轨道 |
| 文字 clip | 琥珀 35% | 文字层 |
| 音频 clip | 青 28% | 音频轨 |
| 转场 clip | 中灰 10% | 辅助信息 |
| label 小字（"类型"/"起点"/SELECTED） | 紫浅 | 代替灰字 · 提对比度 |
| 正文描述 | 白 `--fg` | 主信息 |
| 次要说明 | `--fg-2` 88% | 对比度够 |
| kind tag AI | 紫浅底 + 紫字 | AI 语义 |
| kind tag 人 | 灰白 · 无色 | 人中性 |

### 2.4 背景 / 玻璃（Aurora + Grain）

```css
/* 底 */ --bg: #0a0a0d;
/* aurora 4 层叠 */
body::before {
  background:
    radial-gradient(ellipse 60% 45% at 30% 0%, rgba(167,139,250,0.18), transparent 70%),
    radial-gradient(ellipse 50% 40% at 80% 20%, rgba(124,58,237,0.14), transparent 70%),
    radial-gradient(ellipse 40% 30% at 70% 80%, rgba(94,234,212,0.04), transparent 70%),
    radial-gradient(ellipse 50% 40% at 30% 100%, rgba(124,58,237,0.08), transparent 70%);
}
/* SVG grain · 跨平台 · mix-blend overlay */
body::after { background-image: <svg fractalNoise>; opacity: 0.35; mix-blend-mode: overlay; }
```

---

## 3. 字体 & 字号（Typography）

### 3.1 字体栈（system · 零依赖）

```css
--font: -apple-system, BlinkMacSystemFont, "Inter", "PingFang SC",
        "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif;
--mono: "SF Mono", "JetBrains Mono", "Monaco", Menlo, Consolas, monospace;
```

**不外链 Google Fonts** · 用系统字体保跨平台加载 0 延迟。

### 3.2 字号刻度

| 用途 | px | weight |
|---|---|---|
| 超大数字 / brand | 52-72 | 800 |
| h2 段标题 | 28-48 | 700 |
| body 正文 | 13 | 400-500 |
| label 小标题 | 10-11 | 600-700 + letter-spacing 0.14-0.18em uppercase |
| 超小 mono | 9-10 | 500-700 |

### 3.3 letter-spacing

- 正文：0 ~ 0.02em
- 小字 label：0.1-0.18em（uppercase 标签）
- 大标题：-0.02 ~ -0.04em（tight）

---

## 4. 几何（Geometry）

### 4.1 直角风 · 全局 reset

```css
*, *::before, *::after { box-sizing: border-box; border-radius: 0; }
```

### 4.2 圆的例外（允许 `border-radius: 50%`）

- `.tb-dots span` mac 红黄绿灯（原生约定）
- `.log-av` 头像 / `.live-dot` / `.anchor-dot`（圆点标记）
- `.playctl .scrub .head` 拖把
- `.live` 在线点

### 4.3 间距（Padding/Gap/Margin）

| 组件 | 值 |
|---|---|
| app 外 padding | 32px |
| app border | 1px var(--bd) |
| panel 内 padding | 10-16px |
| log entry padding | 10-12px |
| log 间 gap | 6-7px |
| button padding | 10-14px |
| topbar height | 46px |
| panel-head height | 38-44px |
| timeline height | 250px 固定 |

---

## 5. 玻璃质感（Glassmorphism · 跨平台稳定）

### 5.1 三级纵深

```css
/* 外最透 */ body (无 backdrop)
/* 主 app 玻璃 */  .app { backdrop-filter: blur(50px) saturate(1.5); background: rgba(14,14,19,0.55); }
/* panel 薄玻璃 */ .panel { backdrop-filter: blur(20px) saturate(1.2); background: rgba(8,8,12,0.42); }
/* 中 stage 更透 */ .stage { background: rgba(0,0,0,0.08); /* 无 backdrop */ }
```

### 5.2 玻璃边光

```css
.app {
  box-shadow:
    0 30px 90px rgba(0,0,0,0.6),
    inset 0 1px 0 rgba(255,255,255,0.08),    /* 顶部亮边 */
    inset 0 0 0 0.5px rgba(255,255,255,0.03); /* 全边微光 */
}
.app::before {
  /* 顶部 180px 径向光晕 · 玻璃反光 */
  background: radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,255,255,0.04), transparent 70%);
}
```

### 5.3 必加 -webkit- 前缀

```css
backdrop-filter: blur(...);
-webkit-backdrop-filter: blur(...);

mask-image: radial-gradient(...);
-webkit-mask-image: radial-gradient(...);
```

---

## 6. 布局（Layout）

### 6.1 App 三栏 grid

```css
.body {
  display: grid;
  grid-template-columns: 300px 1fr 300px;
  min-height: 0;
}
```

### 6.2 纵向分区（app shell）

```
┌─────────────────────────────────────┐
│ topbar (46px · 一行)                 │
├───────┬──────────────────┬──────────┤
│ 左    │                  │ 右       │
│ 片段  │  preview (flex)  │ inspector│
│ 列表  │  playctl (46px)  │  导出    │
│ ───   │  timeline (250px)│  属性    │
│ 日志  │                  │  效果    │
│ 倒序  │                  │          │
└───────┴──────────────────┴──────────┘
```

### 6.3 topbar 必须一行

```
[🔴🟡🟢] | [🏠home] / [NextFrame ˅] / [EP-01 ˅] | [脚本 | 视频切片 | 语音生成 | 视频制作] | [中文 ˅]
```

---

## 7. 核心组件清单（Components）

### 7.1 导航类

| 类名 | 说明 |
|---|---|
| `.topbar` | 顶部单行栏 · 46px |
| `.tb-dots` | mac 红黄绿三点 · 圆 · 不可交互 |
| `.tb-home` | 返回首页 · SVG 房子线框 · hover 玻璃底 |
| `.tb-drop` | 项目/集 breadcrumb 下拉 · hover 显玻璃底 + border |
| `.tb-drop.ep` | 当前集 · 加粗 |
| `.slash` | 分隔符 `/` · 30% 透明度 |
| `.tb-tabs .tb-tab` | Tab 栏 · 下划线 2px 当前 |
| `.tb-lang` | 右侧语言下拉 · 玻璃按钮 · chev `˅` |

### 7.2 面板类

| 类名 | 说明 |
|---|---|
| `.panel` / `.panel.right` | 左右侧栏 · backdrop-filter 20px |
| `.panel-head` | 面板顶标题栏 · 38px · uppercase label |
| `.live` | 绿点 · 6x6 圆 · pulse 动画 |

### 7.3 片段列表

| 类名 | 说明 |
|---|---|
| `.clips-section` | 左 panel 顶段 · 固定 252px |
| `.clip-row` | 单 clip 行 · [紫竖标 name 琥珀时长] |
| `.clip-row.active` | 紫色底 + 左 2px inset |

### 7.4 日志类（倒序 · `flex-direction: column-reverse`）

| 类名 | 说明 |
|---|---|
| `.log` | 卡片 3 行：kind+time / desc / cli |
| `.log-kind` | `AI` 紫浅底 / `人` 灰无色 |
| `.log-time` | 琥珀 75% · monospace · 只绝对时间 |
| `.log-desc` | 白字 · 关键数据加粗 · `code` 紫浅底 |
| `.log-cli` | 深色 mono · `$` 琥珀 · 命令名紫浅 · flag 灰 |
| `.log.pending` | 琥珀边框 + 底 · 命令行 `$` 琥珀 |

### 7.5 预览 & 播控

| 类名 | 说明 |
|---|---|
| `.preview` | 中央舞台 · flex 1 · padding 32px |
| `.frame` | 视频帧 · 16:9 · 紫色径向光 + 网格纹 |
| `.playctl` | 播放控件 · 46px · 白色进度条（非紫 · 克制）|
| `.playctl .btn.main` | 主播放按钮 · **白底黑字** · hover 紫 |
| `.playctl .tc .cur` | 当前时间码 · 琥珀 |

### 7.6 时间轴

| 类名 | 说明 |
|---|---|
| `.timeline` | 底部时间轴 · 250px 固定 |
| `.tl-top` | 顶条 · 锚点列表 + zoom |
| `.tl-ruler` | 刻度尺 · 琥珀数字 |
| `.tl-row` | 轨道行 · 36px |
| `.tl-head-col` | 左 100px 轨标签 + 8x8 四色方块 |
| `.tl-row .d.scene/text/trans/audio` | 4 色方块 · 紫/琥珀/灰/青 |
| `.clip` | 片段 · 4 色系 · 无左竖线 · 纯方块填色 |
| `.clip.active` | 选中 · 紫加深 · inset 白边 |
| `.clip.audio .wave` | 波形 80 个 `<b>` · 白 18% 高度变化 |
| `.anchor-tri` | **轨道底部倒三角** ▲ · 琥珀色 · label 浮在三角上方 |
| `.playhead` | 1px 白 · 顶部 7x7 方块 |

### 7.7 Inspector

| 类名 | 说明 |
|---|---|
| `.insp` | 右 panel 内容 · flex 1 · overflow auto |
| `.export-btn` | 导出按钮 · 白底黑字 · hover 紫 · `导出视频 · 4K · HEVC` |
| `.insp-sel` | 已选片段卡片 · 紫底 + 2px 紫左条 |
| `.insp-card h4` | 段标题 · 紫浅 · uppercase |
| `.insp-f .k` | 字段名 · 紫浅 75% · letter-spacing 0.1em |
| `.insp-f .v` | 字段值 · 白 mono · 深底 + border |
| `.insp-f .v.accent` | 紫浅值（锚点表达式） |
| `.insp-tags .tg` | 小标签 · 白 mono · 灰底 |

### 7.8 脚注

| 类名 | 说明 |
|---|---|
| `.caption` | 图例栏 · 玻璃底 · 色 swatch 对应 clip 颜色 |
| `.foot` | 版权/路径 · mono 小字 |

---

## 8. 动效（Motion）

### 8.1 transition 标准

```css
transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
```

只 transition：`background` · `color` · `border-color` · `opacity` · `transform`。**禁 transition: all**。

### 8.2 hover 微动

- 卡片 `transform: translateY(-1px)` + 加深 background
- tab 下划线颜色 transition
- 禁大幅动画（缩放、位移 > 2px、阴影鲜明变化）

### 8.3 禁用

- ❌ `@keyframes` 彩色脉动（除 `.live-dot pulse` 一处）
- ❌ 3D transform
- ❌ 粒子 / 星光
- ❌ 滚动触发动画（用户 PM 看设计静态即可）

---

## 9. 文案规范（Copy）

### 9.1 中英文分工

| 中文 | 英文保留 |
|---|---|
| 用户可见说明 / 标签 / 按钮 | CLI 命令（`nf build`） |
| 轨道名（画面/文字/转场/音频） | 锚点 ID（`feat-1-end`） |
| 属性（类型/起点/时长/特效/调色） | 效果参数（`glass-flip` / `blur · 8px`） |
| 面板标题（片段/已选片段/AI 操作日志） | 视频规格（4K / HEVC / HDR10 / fps / LUT） |
| 状态（已同步 ≠ synced 英文 · 已同步） | brand 名（NextFrame） |
| 图例（画面/文字/音频/转场/时间锚点/播放头） | clip ID（`feat-2` / `bgm` · 内容标识） |

### 9.2 不用 emoji

所有 emoji 删光。图标用：
- **SVG 线框**（home / arrow / close 等）
- **unicode 字符**（`˅` `▲` `$` `·` `−` `×`）
- **纯文字标签**（AI / 人）

---

## 10. 跨平台 CSS 硬约束（Cross-platform）

### 10.1 必加前缀

```css
backdrop-filter + -webkit-backdrop-filter
mask-image      + -webkit-mask-image
background-clip + -webkit-background-clip
```

### 10.2 禁用 / 替代方案

| 禁 | 原因 | 替代 |
|---|---|---|
| `filter: drop-shadow(... <color> ...)` | Firefox/Safari 色差 | `box-shadow` |
| `conic-gradient` | 老 Firefox 不稳 | SVG / 多 radial |
| `@import url(Google Fonts)` | 加载延迟 / 离线崩 | system font stack |
| `font-variation-settings` | 跨平台 axis 差 | 标准 weight 400/500/600/700/800 |
| `content-visibility: auto` | 仅 Chromium | 不用 |
| emoji 图标 | Safari/Win/Android 渲染差异大 | SVG / unicode 字符 |

### 10.3 字体回退

system font stack 保证：macOS = SF Pro · Windows = Segoe UI · Linux = Inter / Roboto · 中文 = PingFang SC / 黑体。

---

## 11. 一致性校验（Checklist）

写任何 NextFrame 产品 HTML 前/后过一遍：

- [ ] `border-radius: 0` 全局 · 仅圆点标记 50%
- [ ] 配色：紫 + 琥珀 + 青 + 灰白 · 无其他色
- [ ] 数字 / 时间码 / CLI `$` / warning → 琥珀
- [ ] label / h4 小标题 → 紫浅（不是灰）
- [ ] 零 emoji · 用 SVG 或字符
- [ ] 零 CDN 依赖 · system font stack
- [ ] `backdrop-filter` 加 `-webkit-` 前缀
- [ ] 三级玻璃纵深（app 50px · panel 20px · stage 无）
- [ ] topbar 一行（红绿灯 + breadcrumb + tabs + 右工具）
- [ ] 导出按钮白底黑字 · hover 紫（**非橙色**）
- [ ] 用户可见文案 → 中文
- [ ] CLI / 锚点 ID / 效果参数 → 英文保留

---

## 12. Examples & canonical 参考

**官方参考原型**：`spec/design/prototypes/editor-v0.1.html`

所有新产品 HTML（桌面端新页面 / 移动端 / landing / 设置页 / onboarding 等）必须：
1. 先读这个文件
2. 引用 `tokens.css`（CSS 变量唯一源）
3. 复用本 DESIGN.md 组件类名
4. 不发明新色 / 不改 token 值

新组件加进来 → 追加本 DESIGN.md §7 + `tokens.css`。

---

## 13. 版本演化

- v0.1（本）：奠定紫+琥珀+青+灰基线 · 11 条宪法之 P7 HTML 满表达力落地视觉
- 未来升级：**只能加 token / 组件 · 不能破坏语义**（semver major 才能）

如果某版本要重大视觉变革 → 另起 `DESIGN-v2.md` + 共存期 · 不直接覆盖本文件。

---

## 14. 讲解类 vs 产品类（分工）

**本文件 = 产品视觉规范**（桌面编辑器 / 设置 / landing / 真实 app UI）

**讲解类 HTML**（PM 文档 / brief / walkthrough / 版本总览 / principles 讲解）走 `explain-to-pm` skill 的**跨项目**固定模式：
- `skills/explain-to-pm/references/scroll-ppt/ppt-scroll-base.html`（A 档 · PPT + TTS）
- `skills/explain-to-pm/references/frame/index.html.template`（B 档 · 逐帧翻页）

讲解类**不引用**本文件 token · 不依赖项目设计语言 · 项目换品牌不影响。

判断：
- 用户会实际**操作**的界面 → 产品类 → 本 DESIGN.md
- 用户只**看** + **讲**的 → 讲解类 → explain-to-pm skill

---

**Last updated**: 2026-04-21 · v0.1.0 kickoff
**Canonical**: `spec/design/prototypes/editor-v0.1.html`
**Tokens**: `spec/design/tokens.css`
