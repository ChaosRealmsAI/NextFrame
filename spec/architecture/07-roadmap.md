# 07 · Roadmap

## 版本线

| 版本 | 定位 | 状态 |
|------|------|------|
| v0.1 | CLI 渲染引擎 | ✅ released |
| v0.2 | 桌面壳 + GPU 录制 | 🔧 进行中 |
| v0.3 | HTML-first 混合渲染 + 可编辑预览 | 📐 设计中 |

## v0.1 — CLI 渲染引擎 ✅

- 25 CLI 子命令、12 AI tools、39 scene 函数
- napi-canvas CPU 渲染 + ffmpeg libx264 编码
- 74 tests、6 architecture tests
- frame-pure 渲染合约

## v0.2 — 桌面壳 + GPU 录制 🔧

**已完成：**
- wry + tao 桌面壳（WKWebView）
- bridge IPC（project/episode/segment CRUD）
- recorder 迁移（4717 行 Rust）
- harness HTML 生成器（timeline → 自包含 HTML）
- GPU 录制管线：WKWebView → CALayer → VideoToolbox → MP4
- 智能帧跳过（__hasFrameChanged）
- 实测：4K 10s 视频 9.6s 渲染

**进行中：**
- CALayer 同步截图优化（opt-09）
- 并行 WebView 渲染（opt-10）
- 视觉质量修复

## v0.3 — HTML-first 混合渲染（下一步）

### 核心变化

**从"单 Canvas 合成"到"HTML 页面即画面"。**

v0.1-v0.2 的 engine 把所有 clip 画到一个 `<canvas>` 上，用 JS 做合成。
v0.3 的 engine 变成 DOM 编排器：

- 每个 track = `<div>`（z-index）
- 每个 clip = 子容器（CSS filter / blend / opacity / transform）
- scene 选最适合的技术：Canvas / DOM / SVG / WebGL / Video
- 浏览器 GPU 自动合成

### 改动范围

| 模块 | 改动 | 说明 |
|------|------|------|
| harness-gen.js | **重写** | 从"一个 canvas"到"多层 DOM" |
| engine (web) | **重写** | 从"canvas 合成器"到"DOM 编排器" |
| scene 代码 | **部分改** | 文字类改 DOM，特效类保留 canvas |
| effects | **简化** | 用 CSS opacity + transform 替代 JS |
| filters | **简化** | 用 CSS filter 替代像素操作 |
| blend | **简化** | 用 CSS mix-blend-mode |
| recorder | **不改** | CALayer 截图不关心 HTML 内容 |
| __onFrame 协议 | **不改** | JS 控制时间不变 |
| timeline JSON | **不改** | 数据模型不变 |

### 新能力

- 文字永远清晰（DOM 系统字体渲染）
- SVG 4K 无损缩放
- backdrop-filter 毛玻璃
- CSS Grid/Flex 自动布局
- 编辑器可拖拽预览（DOM 元素天然可交互）
- WebGL 着色器背景

### v0.3 里程碑

| 步骤 | 内容 |
|------|------|
| v0.3.0 | POC: 混合渲染 showcase ✅ |
| v0.3.1 | harness-gen v2: 多层 DOM 生成 |
| v0.3.2 | engine v2: DOM 编排器 |
| v0.3.3 | scene 迁移: 文字类 → DOM |
| v0.3.4 | 编辑器交互: 拖拽 + 写回 JSON |
| v0.3.5 | 全量验证 + benchmark |

## 暂不做

- 插件系统
- 云协作
- 浏览器版
- Windows 打包
- 在线素材库

## 数字快照

| 指标 | v0.1 | v0.2 (当前) |
|------|------|------------|
| Scenes | 33 | 39 |
| CLI commands | 25 | 25 |
| AI tools | 12 | 12 |
| Tests | 74 | 131 |
| Rust 代码 | 0 | ~5000 行 |
| 10s 视频渲染 | ~360s (CPU) | ~10s (GPU) |
| 4K 支持 | ❌ | ✅ 9.6s |
