# Step 0 · 选组件类型 + 视觉主体

scene 契约 v4（ADR-021）只剩 **两种 type**：`dom` 和 `media`。别想别的。

## 1 · 先读 theme.md（硬前置）

```bash
cat src/nf-core/scenes/{ratio-dir}/{theme}/theme.md
```

- ✅ 存在 → 所有 hex / 字号 / 字体全从这里拷贝到组件文件里写死
- ❌ 不存在 → **停，先跑 `nf-guide design`**，没 theme.md 写组件 = 设计语言靠猜 = 重做

---

## 2 · 定 type（3 条 if-else 走完）

```
if 组件要挂真实 <video> / <img> / <audio> 外部资源 → media
else if 挂其他任何东西（卡片/标题/大数字/SVG/canvas/WebGL/filter/代码块）→ dom
else 看不懂 → dom（理性默认）
```

**铁律**：不是挂外部资源，就是 `dom`。`dom` 里可以自由写 `<svg>` / `<canvas>` / WebGL script / CSS filter / 3D transform — 技术是手段，type 是语义分类。

| type | 契约 | 用途 |
|------|------|------|
| **dom** 默认 | `render(t, params, vp) → string` | 所有自生成视觉：卡片 / 标题 / 大数字 / 图表 / SVG / canvas / filter / 背景 |
| **media** | `render(t, params, vp) → string` 内含 `<video>` / `<img>` / `<audio>` | 只标记外部资源语义（recorder 要识别视频覆盖层） |

**决策参考**：`src/nf-core/scenes/_examples/scene-dom-card.js`（最小 dom 骨架）/ `scene-media-video.js`（最小 media 骨架）。**复制这两个，不要从零写。**

---

## 3 · 定 role（6 选 1，z 从下到上）

| role | 用途 | 数量 |
|------|------|------|
| **bg** | 底色 / 渐变 / 纹理 | 一 slide 一个 |
| **content** | 主内容（卡片 / 列表 / 代码 / 图） | 画面主角 |
| **text** | 大标题 / 金句 / 字幕 | 覆盖 content 之上 |
| **chrome** | 顶 / 底带（品牌 / 集数 / 进度） | 全集共享 |
| **overlay** | 徽章 / 章节标 / 进度条 | 浮最上层 |
| **data** | 图表 / 数字可视化 | content 子类 |

role 判错不致命（gallery 能看出）。type 判错致命（整个 render 契约对不上）。

---

## 4 · 定视觉主体（铁律：40% 铁律）

> **每帧必须有一个视觉主体，占画面 40% 以上空间。纯文字页 = 废。**

### 12 种模式选 1

| 模式 | 视觉主体 | 例 |
|------|---------|-----|
| **metric** | serif 200-320px 大数字 | "87 类"、"2.5 万"、"35%" |
| **walkthrough** | 真界面 / 真代码 | IDE 逐行高亮 / 终端命令 |
| **annotate** | 单一主体 + 标注 | JSON 请求 + 字段标记 |
| **race** | 对比图 | A vs B 选型 |
| **system** | 节点图 ≤ 7 节点 + 连线 | 流程 / Agent Loop |
| **before-after** | 左右分屏 / 叠压 | 压缩前后 / 改版对比 |
| **trap** | 先错觉后反转 | "你以为 X，其实 Y" |
| **contrast** | 双栏对齐 | 主 vs 子 / 理论 vs 实际 |
| **tradeoff** | 天平 / 滑条 | 速度 ↔ 质量 |
| **setup** | 大标题 + 装饰主体 | 开场 / 章节入 |
| **reveal** | 金句 + 微光 | 收尾 / 结论 |
| **rule** | 全幅规则画面 | "❌ 不要 X / ✅ 要 Y" |

### 绝对禁止

- ❌ 大方框写 "Claude Code"
- ❌ 三齿轮代表 "系统"
- ❌ Emoji 当主视觉
- ❌ 一帧只有 H1 + H2 + bullet list

---

## 5 · 填决策表（脑内或 `tmp/.autopilot/` 里记一份）

```
组件 id:        (camelCase)
role:          (bg/chrome/content/text/overlay/data)
type:          (dom | media)  ← 只能这两种
模式:           (12 种之一)
视觉主体:        (具体的 — "真的终端窗口带行号" / "serif 200px 数字 87")
ratio:         (16:9 或 9:16)
theme:         (已存在的 theme.md 名字)
frame_pure:    (读 t 就 false，不读就 true)
一句话目的:       (这组件解决什么问题)
```

4 项填不出来 = 没想清楚，**不准进下一步**。

## 下一步

决策表填完 → `cargo run -p nf-guide -- component aesthetics`
