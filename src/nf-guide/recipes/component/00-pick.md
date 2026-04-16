# Step 0 · 选组件类型 + 视觉主体

**先定"要画什么"，再定"怎么画"。** scene 不再是技术分类系统，而是 **JS 写的时间驱动 HTML 模板函数**。

## 1 · 定 role + type

### role（6 选 1）

```
┌──────────────────────────────────────────────────────────┐
│  z_layer 从下到上                                         │
├──────────────────────────────────────────────────────────┤
│  bg       底色/渐变/纹理               一张 slide 一个     │
│  content  主内容（卡片/列表/代码/图）  画面的主角          │
│  text     大标题/金句/字幕            覆盖在 content 上   │
│  chrome   顶/底带（品牌/集数/进度）    全集共享，固定位置  │
│  overlay  小徽章/章节标/进度条细线    浮在最上层          │
│  data     图表/数字可视化              content 的数据子类 │
└──────────────────────────────────────────────────────────┘
```

### type（2 选 1）

| type | 何时用 | render 契约 |
|------|--------|-------------|
| **dom** 默认 | 所有自生成内容：卡片、标题、图表、SVG、Canvas、滤镜、3D、WebGL、动效 | `render(host, t, params, vp)` 或返回 HTML 字符串 |
| **media** | 依赖真实外部资源：video / img / audio | `render(host, t, params, vp)` |

**结论很简单**：
- 只要内容是你自己生成的，不管内部用 `<div>`、`<svg>`、`<canvas>`、`<video>`、`<script>`，都选 `dom`
- 只有组件需要标记外部资源语义时，才选 `media`

### dom 的真正含义

`dom` 不是"只能写 div"。它是：

```js
render(host, t, params, vp) {
  host.innerHTML = `
    <div>...</div>
    <svg>...</svg>
    <canvas width="${vp.width}" height="${vp.height}"></canvas>
  `;
}
```

所有技术性手段都在 dom type 里自由实现：
- Canvas / SVG / filter / blur / mix-blend / WebGL / 3D transform
- t-driven inline style
- inline `<script>` 做一次性绘制或 canvas redraw

type 只做**语义分类**，不再做技术分类。

### media 的边界

| 场景 | 为什么用 media |
|------|---------------|
| 嵌入真实视频片段 | recorder / assets 需要识别外部 src |
| 嵌入真实图片 | 资源管理需要知道它不是自生成 |
| 嵌入真实音频 | 同上 |

---

## 2 · 定视觉主体（铁律）

> **每帧必须有一个视觉主体，占画面 40% 以上空间。纯文字页 = 废。**

### 视觉主体 12 种模式

| 模式 | 视觉主体 | 用在 | 例 |
|------|---------|------|-----|
| **metric** | serif 200-320px 大数字 | 讲数量/对比 | "87 类"、"2.5 万"、"35%" |
| **walkthrough** | 真界面/真代码原型 | 讲过程 | 终端命令一步步 / IDE 逐行高亮 |
| **annotate** | 单一主体 + 2-3 个标注 | 讲细节 | JSON 请求 + 标记字段含义 |
| **race** | 对比图 | A vs B 选型 | 模型/方案对比 |
| **system** | 节点图（≤ 7 节点 + 连线） | 讲系统结构 | Agent Loop 4 节点流转 |
| **before-after** | 左右分屏或叠压 | 讲变化 | 压缩前 vs 压缩后 |
| **trap** | 先给错觉，后反转 | 反直觉 | 你以为 X，其实 Y |
| **contrast** | 双栏对齐比较 | 讲差异 | 主 Agent vs 子 Agent |
| **tradeoff** | 天平/滑条 | 讲取舍 | 速度 ↔ 质量 |
| **setup** | 超大标题 + 装饰主体 | 开场 | "这一切，从 87 开始..." |
| **reveal** | 大字金句 + 微光 | 收尾 | "你写了 1 行，系统拼了 87 类" |
| **rule** | 全幅规则画面 | 强调原则 | "❌ 不要 X / ✅ 要 Y" |

### 视觉主体来源（从好到差）

1. ⭐⭐⭐⭐⭐⭐ 真实界面原型图
2. ⭐⭐⭐⭐⭐ 真 artifact 内嵌
3. ⭐⭐⭐⭐⭐ 真数据可视化
4. ⭐⭐⭐⭐ 超大数字/符号
5. ⭐⭐⭐ 手绘风示意图
6. ⭐⭐ 纯文字装饰

### 绝对禁止

- ❌ 大方框写"Claude Code"
- ❌ 圆圈写"AI Model"
- ❌ 三齿轮代表"系统"
- ❌ Emoji 当主视觉
- ❌ 一帧只有标题+副标+bullet list

---

## 2.5 · 图 > 文铁律（选 type 前必答）

先问 4 个问题：

1. **这个组件有没有可见的主体图形？** 没有就先回去补主体，不要急着写代码
2. **主体最适合用什么 HTML 组合实现？** `div` / `svg` / `canvas` / `video` / 混合都可以，但 type 仍然是 `dom`
3. **是否依赖真实外部资源？** 依赖才用 `media`
4. **动画是不是完全由 t 推导？** 是就继续；不是就重想，别偷用系统时钟

### 简化后的分层公式

```
一个好的 slide = bg(dom 或 media) + content/text/data(dom) + chrome/overlay(dom)
```

不是旧时代那种"按技术栈拼 type"的做法了。
真正重要的是：
- 底层有氛围
- 中层有主体
- 上层有强调

### 关键说明

**所有技术性（Canvas / SVG / WebGL / 3D / filter）都在 dom type 的 HTML 字符串里自由实现。**

---

## 3 · 填这张决策表

写在脑子里或 `.autopilot/` 里：

```
组件 id:        (camelCase)
role:          (bg/chrome/content/text/overlay/data)
type:          (dom | media)
模式:           (12 种之一)
视觉主体:        (具体的 — "真的终端窗口带行号" / "serif 200px 数字 87")
画面比例:        (ratio)
静态 or 动态:    (frame_pure=true 无时间变化 / false 随 t 变)
入场动画:        (fade / slideUp / stagger / drawLine / counter / none)
一句话目的:       (这个组件解决什么问题)
```

4 项填不出来 = 没想清楚，**不准进下一步**。

## 下一步

决策表填完 → `cargo run -p nf-guide -- component aesthetics`
