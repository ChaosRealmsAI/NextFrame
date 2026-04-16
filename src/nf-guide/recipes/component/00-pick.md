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

### type（7 选 1 — 决定 render 签名）

| type | 何时用 | render 签名 |
|------|--------|-------------|
| **dom** 默认 | UI 布局（卡片、列表、聊天、代码块、按钮、标签） | `render(host, t, params, vp)` |
| **canvas** | 需要逐像素效果（滤镜/粒子/颗粒/noise） | `render(ctx, t, params, vp)` |
| **svg** | 矢量图标、流程图节点连线、几何路径 | `render(host, t, params, vp)` |
| **media** | 嵌入真实 video/img/audio | `render(host, t, params, vp)` |
| **shader** | GPU 背景效果（流光/噪声/水波/极光） | `render(host, t, params, vp)` → `{ frag, uniforms? }` |
| **particle** | 确定性粒子（星场/雪/火花/连线/浮尘） | `render(host, t, params, vp)` → `{ emitter, field?, render }` |
| **motion** | 矢量语义动画（点赞/图标/涟漪/路径描边） | `render(host, t, params, vp)` → `{ duration, size, layers }` |

**UI 类组件默认 DOM。** 硬塞 canvas = 中文字体方框 + 手算坐标 + 改色要重画 + 无 DOM tree 可审。

### 7 种 type 的设计选型指南（视频 + 技术结合思考）

**核心原则：每种 type 有最适合的视觉场景。选错 type = 事倍功半。**

#### shader — 画面底层质感（z-layer: background / overlay）

| 最佳场景 | 为什么用 shader | 质量标准 |
|---------|----------------|---------|
| 流光渐变背景 | GPU 并行逐像素，CSS gradient 做不到的流动感 | 渐变过渡丝滑、无色带 |
| 柏林噪声/有机纹理 | fbm + simplex 叠加出自然感 | 层次 ≥ 3（base + detail + micro）|
| 水波/极光/能量场 | 三角函数 + noise 组合出复杂运动 | 多波源叠加、不能只有一个 sin |
| 全屏滤镜（颗粒/晕影/色差） | 后处理叠加在任何画面上 | 颗粒感 subtle 不抢眼、晕影自然 |
| 程序化背景替代静态图 | 零资源依赖 + 无限分辨率 | 看不出是"计算机生成的" |

**amateur 陷阱**：一行 `sin(uv.x * 3.0 + uT)` 了事 → 专业做法：从 Shadertoy 扒 30+ 行成熟 shader 重写。GLSL ≥ 20 行才能出好效果。

#### particle — 画面氛围层（z-layer: background / overlay）

| 最佳场景 | 为什么用 particle | 质量标准 |
|---------|-----------------|---------|
| 星场/太空背景 | 深度分层（near 大亮 / far 小暗）+ 视差 | 3 层深度、冷暖色温梯度 |
| 雪花/雨滴/灰尘 | 自然下落 + 风偏移 + 底部回卷 | 大小不均、速度不均、有旋转 |
| 火花爆发/庆祝 | 从一点向外辐射 + 衰减 | 有尾迹、glow、head 亮度高 |
| 网络连线图 | 节点漂浮 + 距离 < 阈值画连线 | 连线透明度随距离变、有呼吸 |
| 漂浮光点/氛围 | 少量(30-50)慢速 sin 轨迹 | 各自相位不同、不同步 |

**amateur 陷阱**：粒子全部同大小同颜色同速度 → 专业做法：depth 分层、色温梯度、alpha 呼吸、大小随 depth 变。

#### motion — 矢量语义动画（z-layer: overlay / content）

| 最佳场景 | 为什么用 motion | 质量标准 |
|---------|----------------|---------|
| 点赞/收藏/分享反馈 | behavior: impact 一行出物理（squash/stretch/settle） | 有蓄力 → 弹出 → 回弹 → 稳定 |
| 加载/进度指示 | behavior: pulse 循环呼吸 | loop 无缝、不突变 |
| 图标入场动画 | check/cross/arrow + pop/dart behavior | stroke 描边 + 整体弹入 |
| 涟漪/波纹扩散 | type: ripple 一行配置 | 环扩 + 淡出、不停顿 |
| 路径描边动画 | stroke-dasharray + dashoffset 由 t 驱动 | 匀速描边、不用 CSS transition |

**amateur 陷阱**：手写 6 段 keyframe track 但数值不自然 → 专业做法：优先用 behavior 预设（impact/pulse/pop/dart），让引擎出物理对的曲线。

#### dom — 信息排版层（z-layer: content / text / chrome）

| 最佳场景 | 为什么用 dom | 质量标准 |
|---------|-------------|---------|
| 卡片/列表/grid 布局 | CSS flexbox/grid 最强 | 留白 ≥ 140px、字号从 7 级挑 |
| 代码块 + 语法高亮 | pre + span 着色 | 真 monospace、行号、高亮行 |
| 聊天气泡/对话模拟 | 左右交替 div | 头像 + 气泡 + 时间戳 |
| 大标题/金句/字幕 | serif 大字 + 微动效 | t-driven opacity/transform，禁 @keyframes |
| UI 界面原型 | HTML 像素级还原真产品 | 截图看起来是真 app |

**amateur 陷阱**：用 @keyframes CSS 动画 → compose 每帧重建 DOM，动画永远不完成。必须 t-driven inline style。

#### canvas — 逐像素手绘（z-layer: any）

| 最佳场景 | 为什么用 canvas | 质量标准 |
|---------|----------------|---------|
| 波形/频谱可视化 | 逐点 lineTo | 平滑曲线、颜色渐变 |
| 手绘风笔触 | bezierCurveTo + 压感 | 粗细变化、末端收尖 |
| 热力图/场可视化 | ImageData 逐像素 | 色彩映射连续、无色带 |

**注意**：大部分"以前用 canvas 的场景"现在有更好的选择 — 粒子用 particle type、noise 用 shader type、图标用 motion type。canvas 只在"真的需要逐像素控制且不是 shader/particle/motion 能覆盖的"时才用。

#### svg — 矢量图形（z-layer: content / data）

| 最佳场景 | 为什么用 svg | 质量标准 |
|---------|-------------|---------|
| 流程图/节点连线 | path + circle + text | ≤ 7 节点、连线有箭头 |
| 数据图表 | rect/circle/line 组合 | 数据真实、有坐标轴 |
| 矢量图标（静态） | 复用 Heroicons/Lucide path | 单色、统一 stroke-width |

**注意**：需要动画的矢量图标 → 用 motion type（有 behavior 预设 + path 描边）。svg type 适合静态或简单 t-driven 变化。

#### media — 真实素材（z-layer: background / content）

| 最佳场景 | 为什么用 media |
|---------|---------------|
| 嵌入真实视频片段 | `<video>` 标签 |
| 产品截图/照片 | `<img>` 原样 |
| 背景音/旁白 | `<audio>` |

### 专业级画面分层公式

```
z-order 从下到上:
  1. shader bg     — 流光/噪声/渐变（GPU 底层质感）
  2. media bg      — 真实视频/照片底图（可选）
  3. particle bg   — 星场/雪花/漂浮光点（氛围层）
  4. dom content   — 卡片/代码/文字（信息主体）
  5. svg content   — 图表/流程图（数据可视化）
  6. motion overlay — 图标弹跳/路径描边（交互反馈）
  7. particle fx   — 火花/爆发（瞬间强调）
  8. shader fx     — 全屏滤镜（颗粒+晕影收尾）
```

**一个好的 slide = bg(shader/particle) + content(dom/svg) + overlay(motion/particle/shader)**。三层叠加出深度感。只有一层 = 平面感强、业余。

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
2. **能不能用 GPU shader 画？**（流光/噪声/水波/极光 → 强制 type=shader）
3. **能不能用确定性粒子系统？**（星场/雪/爆发/连线 → 强制 type=particle）
4. **能不能用矢量动画？**（点赞/图标弹跳/路径描边 → 强制 type=motion）
5. **都不需要专用 runtime，但仍是逐像素 2D 效果？**（笔触/位图滤镜/手写 noise mask → type=canvas）
6. **都不能，真只有文字布局？**（标题/金句/chrome → OK 用 type=dom）

**每个主题必须至少有**：
- ≥ 1 个 SVG 图形组件（diagram / chart / orbit / icon）
- ≥ 1 个动态图形组件（canvas / shader / particle / motion）

纯 DOM 堆文字 = 主题质量不及格。详情看 §8 图 > 文铁律。

## 3 · 填这张决策表

写在脑子里或 `.autopilot/` 里：

```
组件 id:        (camelCase)
role:          (bg/chrome/content/text/overlay/data)
type:          (dom/canvas/svg/media/shader/particle/motion)
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
