# Step 0 · 选组件类型 + 视觉主体

**先定"要画什么"，再定"怎么画"。** 跳过这步 = 做出来没灵魂的方块。

## 1 · 定 role + type

### role（6 选 1）

```
┌──────────────────────────────────────────────────────────┐
│  z_layer 从下到上                                         │
├──────────────────────────────────────────────────────────┤
│  bg       底色/渐变/粒子               一张 slide 一个     │
│  content  主内容（卡片/列表/代码/图）  画面的主角          │
│  text     大标题/金句/字幕            覆盖在 content 上   │
│  chrome   顶/底带（品牌/集数/进度）    全集共享，固定位置  │
│  overlay  小徽章/章节标/进度条细线    浮在最上层          │
│  data     图表/数字可视化              content 的数据子类 │
└──────────────────────────────────────────────────────────┘
```

### type（4 选 1 — 决定 render 签名）

| type | 何时用 | render 签名 |
|------|--------|-------------|
| **dom** 默认 | UI 布局（卡片、列表、聊天、代码块、按钮、标签） | `render(host, t, params, vp)` |
| **canvas** | 需要逐像素效果（滤镜/粒子/颗粒/noise） | `render(ctx, t, params, vp)` |
| **svg** | 矢量图标、流程图节点连线、几何路径 | `render(host, t, params, vp)` |
| **media** | 嵌入真实 video/img/audio | `render(host, t, params, vp)` |

**UI 类组件默认 DOM。** 硬塞 canvas = 中文字体方框 + 手算坐标 + 改色要重画 + 无 DOM tree 可审。

---

## 2 · 定视觉主体（铁律）

> **每帧必须有一个"视觉主体"，占画面 40% 以上空间。纯文字页 = 废。**

### 视觉主体 12 种模式（frame-craft 方法论）

选一种，不要混：

| 模式 | 视觉主体 | 用在 | 例 |
|------|---------|------|-----|
| **metric** | serif 200-320px 大数字 | 讲数量/对比 | "87 类"、"2.5 万"、"35%" |
| **walkthrough** | 真界面/真代码原型 | 讲过程 | 终端命令一步步 / IDE 逐行高亮 |
| **annotate** | 单一主体 + 2-3 个标注 | 讲细节 | JSON 请求 + 标记字段含义 |
| **race** | SVG 对比图（双柱/双轴） | A vs B 选型 | GPT-4 vs Claude 指标 |
| **system** | 节点图（≤ 7 节点 + 连线） | 讲系统结构 | Agent Loop 4 节点流转 |
| **before-after** | 左右分屏或叠压 | 讲变化 | 压缩前 vs 压缩后 |
| **trap** | 先给错觉，后反转 | 反直觉 | 你以为 X，其实 Y |
| **contrast** | 双栏对齐比较 | 讲差异 | 主 Agent vs 子 Agent |
| **tradeoff** | 天平/滑条 | 讲取舍 | 速度 ↔ 质量 |
| **setup** | 超大标题 + 装饰 serif italic | 开场 | "这一切，从 87 开始..." |
| **reveal** | 大字金句 + 微光 | 收尾 | "你写了 1 行，系统拼了 87 类" |
| **rule** | 全幅黑底 + 规则文字 + 红/绿标记 | 强调原则 | "❌ 不要 X / ✅ 要 Y" |

### 视觉主体来源（从好到差）

1. ⭐⭐⭐⭐⭐⭐ **真实界面原型图**（HTML+CSS 像素级画出 IDE / 终端 / 聊天 / 菜单 / 设置面板）
2. ⭐⭐⭐⭐⭐ **真 artifact 内嵌**（真代码带语法高亮 / 真文件树 / 真 JSON diff）
3. ⭐⭐⭐⭐⭐ **真数据可视化**（SVG 柱/折线/散点/仪表盘 — 数据不许编造）
4. ⭐⭐⭐⭐ **超大数字/符号**（200-320px serif，专给 metric 模式）
5. ⭐⭐⭐ **手绘风示意图**（SVG 节点图 — 只有没法用真界面时才用）
6. ⭐⭐ **纯文字装饰**（超大引号 / 背景巨字 — 只给 reveal/rule 模式）

### 绝对禁止

- ❌ 大方框写"Claude Code" → 画真的 IDE 窗口
- ❌ 圆圈写"AI Model" → 画真的聊天气泡
- ❌ 三齿轮代表"系统" → 画真节点图
- ❌ Emoji 当主视觉（🤖💡📝） → 用真图标库 SVG
- ❌ 一帧只有"标题+副标+bullet list"（除非是 reveal/rule）

---

## 2.5 · 图 > 文 铁律（选 type 前必答）

**纯 DOM 文字组件 ≤ 30%**。做之前先问：

1. **这组件的视觉主体能不能用 SVG 画？**（流程图/节点/轨道/图表/矢量图标 → 强制 type=svg）
2. **能不能用 Canvas 画动态？**（粒子/星场/波形/径向渐变/滤镜 → 强制 type=canvas）
3. **都不能，真只有文字布局？**（标题/金句/chrome → OK 用 type=dom）

**每个主题必须至少有**：
- ≥ 1 个 SVG 图形组件（diagram / chart / orbit / icon）
- ≥ 1 个 Canvas 动态组件（particle / wave / brush）

纯 DOM 堆文字 = 主题质量不及格。详情看 §8 图 > 文铁律。

## 3 · 填这张决策表

写在脑子里或 `.autopilot/` 里：

```
组件 id:        (camelCase)
role:          (bg/chrome/content/text/overlay/data)
type:          (dom/canvas/svg/media)
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
