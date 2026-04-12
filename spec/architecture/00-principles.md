# 00 · 原则

NextFrame 的设计由 8 条原则约束。v0.2 从 CLI-only 演进到 HTML-first 架构。

---

## 1. Frame-pure is sacred

`f(timeline, t) → pixels` 必须是确定性的。

禁止：scene 读随机源 / 时钟源 / 持有可变状态 / 依赖上一帧结果。
允许：只读常量、查找表、预烘焙缓存。

时间控制：录制时由 `__onFrame({time: t})` 逐帧推进。不用 CSS animation 自动播放，用 JS 每帧算出样式值直接赋给 DOM 元素。浏览器时钟不参与。

---

## 2. JSON is source of truth

`timeline.json` 是唯一真相源。CLI / AI / 编辑器 / 渲染 / 录制的输入全是同一份 JSON。编辑器拖动元素 → 写回 JSON → 录制读 JSON 还原。

---

## 3. HTML is the rendering surface（v0.2 核心）

**一帧 = 一个 HTML 页面在某个时间点的像素快照。**

- 每个 track = 一个 `<div>`（z-index 控制层级）
- 每个 clip = 一个子容器（CSS 控制 filter / blend / opacity / transform）
- scene 内容 = 选最适合的技术（Canvas / DOM / SVG / WebGL / Video / Img）
- 浏览器 GPU 自动合成所有图层
- 录制 = CALayer 截取最终合成像素

不再把浏览器当成 Canvas 画板。DOM 排版、CSS 特效、SVG 矢量、WebGL 3D 全部直接用。

---

## 4. Hybrid rendering: pick the best tool

| 内容 | 技术 | 原因 |
|------|------|------|
| 文字排版 | DOM + CSS | 系统字体清晰、Flex/Grid 布局 |
| 矢量图形 | SVG | 无损缩放、4K 自动清晰 |
| 渐变/粒子 | Canvas 2D | 逐像素控制 |
| 3D/着色器 | WebGL/WebGPU | GPU 直接计算 |
| 视频/图片 | `<video>`/`<img>` | 原生解码 |

CSS 原生能力优先：`filter` / `mix-blend-mode` / `opacity` / `transform` 替代 JS 像素操作。

---

## 5. One HTML, three purposes

| 场景 | 运行方式 |
|------|---------|
| **预览** | 浏览器打开，拖时间轴看 |
| **编辑** | 加交互：拖移元素、调参数、写回 JSON |
| **录制** | WKWebView → __onFrame(t) → CALayer 截图 → MP4 |

编辑器看到什么，录制出来就是什么。

---

## 6. Recorder is technology-agnostic

录制管线不关心 HTML 用什么技术画的：
```
加载 HTML → __onFrame(t) → CALayer.renderInContext() → VideoToolbox H.264 → MP4
```
Canvas / DOM / SVG / WebGL 全被一次截图捕获。Recorder 永远不因 scene 技术变化而修改。

---

## 7. AI is the primary author

AI 写 timeline JSON，不操作 GUI。12 个 AI tools、39 个 scene 画笔、ASCII 预览。所有操作可通过 JSON patch 完成。

---

## 8. Zero external dependencies at runtime

macOS 内置 WebKit = 渲染引擎。VideoToolbox = 硬件编码器。一台全新 Mac 零权限即可运行。
