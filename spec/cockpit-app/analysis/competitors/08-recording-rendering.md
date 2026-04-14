# 录制与渲染工具全景图

> 调研范围：HTML 转视频、屏幕录制、无头浏览器录制、Canvas 捕获、视频编码、分布式渲染。  
> 目标：为 **nf-recorder**（WKWebView 帧驱动 + FFmpeg + 并行录制）提供技术定位参考。

---

## 一、框架级方案（HTML/JS → MP4）

### 1. Remotion
- **GitHub**: [remotion-dev/remotion](https://github.com/remotion-dev/remotion) · ⭐ 43.1k
- **做什么**: 用 React 组件写视频，逐帧渲染输出 MP4/WebM。
- **渲染方式**: Puppeteer 无头 Chrome，每帧调用 React 渲染 → 截图 → FFmpeg 编码。
- **性能**: 受限于 Chrome 截帧速度，大分辨率较慢；支持并行多实例。
- **开源**: 核心 MIT，商业使用需购买许可证。
- **对 nf-recorder 的意义**: 设计思路最接近，但依赖 React 框架 + Node.js 生态，不适合 Rust 嵌入场景。

### 2. Revideo
- **GitHub**: [redotvideo/revideo](https://github.com/redotvideo/revideo) · ⭐ 3.8k
- **做什么**: Motion Canvas 的 fork，面向自动化视频流水线，暴露库 API 而非桌面应用。
- **渲染方式**: Vite + TypeScript 模板 → 无头渲染 + 并行分段。用 ffmpeg 替代 HTML video seek。
- **性能**: 支持并行渲染；支持音频导出。
- **开源**: MIT。
- **对 nf-recorder 的意义**: 架构思路（API 优先 + 并行分段）与 nf-recorder 高度一致，但语言是 TS。

### 3. Motion Canvas
- **GitHub**: [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) · ⭐ 18.4k
- **做什么**: TypeScript 生成器驱动的矢量动画库，支持与语音旁白同步。
- **渲染方式**: Canvas API + 浏览器预览；导出依赖 FFmpeg 插件（图像序列 → 视频）。
- **性能**: 专注于动画质量，非高速批量渲染。
- **开源**: MIT。
- **对 nf-recorder 的意义**: 动画引擎设计可参考；但渲染流程与 nf-recorder 不同（序列帧而非流式）。

### 4. WebVideoCreator (WVC)
- **GitHub**: [Vinlic/WebVideoCreator](https://github.com/Vinlic/WebVideoCreator) · ⭐ 230
- **做什么**: Node.js 框架，将网页动画渲染成视频，支持 CSS3/SVG/Lottie/RAF 动画。
- **渲染方式**: Puppeteer + Chrome `HeadlessExperimental.beginFrame` API（逐帧确定性渲染）+ 虚拟时间注入（劫持 `Date.now`、`setTimeout`、`requestAnimationFrame`）+ FFmpeg 编码。
- **性能**: 5 分钟视频约 1 分钟渲染完（Ryzen 7，GPU 加速）；支持多设备分布式分段渲染。
- **开源**: 开源。
- **对 nf-recorder 的意义**: **技术参考价值最高**。WVC 是 Replit 视频引擎的灵感来源，也是 `beginFrame` + 时间虚拟化方案的最完整实现。nf-recorder 用 WKWebView 替代 Chrome、用 `window.__onFrame` 替代 beginFrame，思路相似。

### 5. html5-animation-video-renderer
- **GitHub**: [dtinth/html5-animation-video-renderer](https://github.com/dtinth/html5-animation-video-renderer) · ⭐ 234
- **做什么**: 将 HTML5 动画渲染为高质量 MP4（支持 1080p60）。
- **渲染方式**: Puppeteer 逐帧调用 `seekToFrame(n)` → 截图 → pipe 到 FFmpeg，无临时文件。支持多 Chrome 实例并行。
- **性能**: 不受帧率限制，每帧可渲任意时长；支持 WebGL、Canvas、SVG。
- **开源**: 开源。
- **对 nf-recorder 的意义**: 与 nf-recorder 的 `window.__onFrame` 帧驱动设计几乎一致，只是渲染引擎是 Chrome 而非 WKWebView。

### 6. Timecut
- **GitHub**: [tungs/timecut](https://github.com/tungs/timecut) · ⭐ 646
- **做什么**: 录制含 JavaScript 动画的网页为流畅视频。
- **渲染方式**: 替换 `Date.now()`、`performance.now()`、`requestAnimationFrame` 等 JS 时间函数 → 虚拟时间线截帧 → FFmpeg。
- **性能**: 适合 JS 动画；**不支持 CSS 动画**（只劫持 JS，CSS 不变）。
- **开源**: 开源。
- **对 nf-recorder 的意义**: 时间虚拟化思路可参考；CSS 动画的局限性正是 nf-recorder 用帧驱动协议绕过的问题。

---

## 二、无头浏览器录制（屏幕级 / CDP 级）

### 7. puppeteer-screen-recorder
- **GitHub**: [prasanaworld/puppeteer-screen-recorder](https://github.com/prasanaworld/puppeteer-screen-recorder) · ⭐ 452
- **做什么**: Puppeteer 插件，用 Chrome DevTools Protocol 逐帧捕获。
- **渲染方式**: CDP 原生帧捕获 → FFmpeg 编码；支持 MP4/AVI/MOV/WEBM。
- **性能**: 支持最高 60fps；**不支持录音**。
- **开源**: MIT。
- **对 nf-recorder 的意义**: 走 CDP 路线，无法精确控制帧时序；nf-recorder 用 `__onFrame` 更精确。

### 8. Playwright 内置录制
- **官网**: [playwright.dev/docs/videos](https://playwright.dev/docs/videos)
- **做什么**: Playwright 测试框架内置的视频录制功能。
- **渲染方式**: CDP `Page.startScreencast` 捕获帧 → FFmpeg 拼接。
- **性能**: 质量锁死 1Mbit/s，无法配置；画质较差，适合测试而非生产。
- **开源**: Apache 2.0。
- **对 nf-recorder 的意义**: 录制定位是测试工具，不适合高质量视频生产。

### 9. headless-screen-recorder
- **GitHub**: [brianbaso/headless-screen-recorder](https://github.com/brianbaso/headless-screen-recorder) · 小众
- **做什么**: 使用 `HeadlessExperimental.beginFrame` 的高质量无头 Chrome 录制。
- **渲染方式**: beginFrame API 精确帧控制 + FFmpeg。
- **开源**: 开源。

---

## 三、浏览器端 Canvas 录制库

### 10. CCapture.js
- **GitHub**: [spite/ccapture.js](https://github.com/spite/ccapture.js) · ⭐ 3.8k
- **做什么**: 以固定帧率捕获 Canvas 动画，哪怕单帧渲染需要几秒也不丢帧。
- **渲染方式**: 劫持 `Date.now()`、`requestAnimationFrame` 等时间函数 → 固定时间步长截帧 → WebM/GIF/PNG 序列。
- **性能**: 不依赖实时性，适合重型动画；**不支持服务器端无头运行**（下载机制依赖浏览器）。
- **开源**: MIT。
- **对 nf-recorder 的意义**: 时间劫持思路是 timecut / WVC / nf-recorder 的共同祖先。

### 11. canvas-record
- **GitHub**: [dmnsgn/canvas-record](https://github.com/dmnsgn/canvas-record) · ⭐ 426
- **做什么**: 从 2D/WebGL/WebGPU Canvas 录制视频，支持 MP4/WebM/MKV/GIF/图像序列。
- **渲染方式**: 优先 WebCodecs（最快）→ 降级 MP4Wasm → 降级 FFmpeg。
- **性能**: WebCodecs 比 H264MP4Encoder 快 5-10x，比 FFmpeg 快 20x。
- **开源**: MIT，零生产依赖。
- **对 nf-recorder 的意义**: 展示了 WebCodecs 在浏览器端编码的极限性能；nf-recorder 在 Rust 侧用 VideoToolbox 编码，性能更高。

### 12. RecordRTC
- **GitHub**: [muaz-khan/RecordRTC](https://github.com/muaz-khan/RecordRTC) · ⭐ 6.9k
- **做什么**: WebRTC JS 库，支持音视频 + 屏幕 + Canvas 录制。
- **渲染方式**: MediaRecorder API + WebRTC；多种 recorderType 可选。
- **性能**: 实时录制，受限于 MediaRecorder 的实时约束（无法离线帧驱动）。
- **开源**: MIT。
- **对 nf-recorder 的意义**: 实时录制场景工具，不适合帧精确离线渲染。

### 13. MediaRecorder API（Web 标准）
- **规范**: [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- **做什么**: W3C 标准，从 MediaStream 或 Canvas 捕获实时流。
- **渲染方式**: 浏览器原生，实时 wall-clock 时间驱动。
- **性能**: **无法离线帧驱动**（时间戳绑定 wall clock）；比较适合会议录制。
- **局限**: 不支持非实时渲染（帧率精度差）；见 [w3c issue #213](https://github.com/w3c/mediacapture-record/issues/213)。
- **对 nf-recorder 的意义**: nf-recorder 主动规避了这个 API，选择帧驱动而非流录制。

---

## 四、DOM 截图库（单帧，非视频）

### 14. html2canvas
- **GitHub**: 最流行 HTML→Canvas 库 · 周下载 260 万
- **做什么**: 把 DOM 渲染到 Canvas，导出图片。
- **渲染方式**: 重新实现部分 CSS 渲染，不是真截图。
- **局限**: CSS 支持不完整；10 个组件截图需 21 秒（性能差）。
- **对 nf-recorder 的意义**: 用于单帧截图，不适合视频帧捕获管线。

### 15. dom-to-image / html-to-image
- **GitHub**: html-to-image 是主流维护版本 · 月下载 160 万
- **做什么**: DOM → SVG foreignObject → Canvas → 图片。
- **渲染方式**: 克隆 DOM，内联样式，序列化 SVG，绘制 Canvas。
- **性能**: 比 html2canvas 快；但同样不是真渲染截图。
- **对 nf-recorder 的意义**: 同上，单帧用途，视频场景不适用。

---

## 五、视频编码层

### 16. FFmpeg（含 VideoToolbox）
- **官网**: [ffmpeg.org](https://ffmpeg.org)
- **做什么**: 业界标准视频编解码工具。
- **硬件加速**: macOS 上用 `h264_videotoolbox` / `hevc_videotoolbox`，相比 CPU 编码快 4-8x，降低 CPU 占用。
- **性能**: Apple Silicon 上 GPU 编码 ~142 FPS（H.264 1080p）；X264 CPU 编码 ~33 FPS。
- **开源**: LGPL/GPL。
- **nf-recorder 当前用法**: `src/nf-recorder/src/encoder/ffmpeg.rs` — 作为编码后端，接收帧数据管道。

### 17. WebCodecs API（Web 标准）
- **规范**: [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)
- **做什么**: 浏览器原生低级编解码 API，支持 H.264/H.265/VP9/AV1。
- **硬件加速**: 调用 OS 级 GPU 编码器（macOS VideoToolbox、Nvidia NVENC 等）；CPU 占用仅 15%，GPU 约 40%。
- **性能**: 比 ffmpeg.wasm 快 8x（200fps vs 25fps，1080p H.264，MacBook Pro）。
- **局限**: 不支持 ProRes/DNxHD 等专业格式；必须用 Chromium。
- **对 nf-recorder 的意义**: nf-recorder 在 Rust 侧直接调 VideoToolbox（等价于 WebCodecs 的 macOS 路径），绕开浏览器沙箱限制，性能更好。

### 18. ffmpeg.wasm
- **GitHub**: [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) · ⭐ 17.4k
- **做什么**: FFmpeg 编译为 WebAssembly，在浏览器内运行。
- **渲染方式**: Emscripten 编译，纯软件编码，无 GPU 加速（WASM 沙箱限制）。
- **性能**: ~25fps（1080p H.264，MacBook Pro）；比 WebCodecs 慢 8x。
- **开源**: LGPL。
- **对 nf-recorder 的意义**: 浏览器端兜底方案；nf-recorder 用原生 FFmpeg 管道，性能无此瓶颈。

### 19. Rust 视频编码生态
- **video-rs**: 基于 libav 的高级 Rust 封装，支持读写编解码。
- **rsmpeg**: thin & safe FFmpeg Rust 绑定（支持 FFmpeg 6.x/7.x）。
- **gpu-video**: Rust GPU 视频解编码库（AdrianEddy，GoPro 工具生态）。
- **OxiMedia**（2026 新）: 纯 Rust 重写 FFmpeg + OpenCV，92 个 crate，Apache 2.0；异步 + WASM 原生支持。
- **对 nf-recorder 的意义**: rsmpeg/video-rs 是 Rust 侧 FFmpeg 集成的标准选择；OxiMedia 未来可替代 FFmpeg 依赖。

---

## 六、屏幕录制工具（终端用户）

### 20. Screenity
- **GitHub**: [alyssaxuu/screenity](https://github.com/alyssaxuu/screenity) · ⭐ 18.1k
- **做什么**: Chrome 扩展，隐私友好的屏幕录制 + 标注工具。
- **渲染方式**: MediaRecorder API + Chrome 扩展 API；导出 MP4/GIF/WebM。
- **开源**: GPLv3（v3.0+）。
- **对 nf-recorder 的意义**: 用户产品，非程序化视频生产工具，参考价值有限。

---

## 七、分布式 / 并行渲染

### 21. Shepherd（分布式编码）
- **GitHub**: [martindisch/shepherd](https://github.com/martindisch/shepherd) · 小众
- **做什么**: 把视频切片分发到多台机器并行编码（work stealing 调度）。
- **对 nf-recorder 的意义**: nf-recorder 已内置并行录制（`src/nf-recorder/src/webview/parallel.rs`），架构思路一致。

### 22. Revideo 并行渲染
- **做什么**: Revideo 框架内置 parallelized rendering，可 serverless 部署。
- **对 nf-recorder 的意义**: 云端并行渲染的参考实现。

---

## 八、关键技术对比

| 技术路线 | 代表工具 | 帧精度 | GPU 加速 | 音频支持 | 跨平台 |
|---------|---------|-------|---------|---------|-------|
| beginFrame + 时间虚拟化 | WVC, Replit | 精确 | 部分 | 复杂 | Chrome 平台 |
| `__onFrame` + WKWebView | **nf-recorder** | 精确 | VideoToolbox | 支持 | macOS 原生 |
| Puppeteer CDP 截帧 | puppeteer-screen-recorder | 近似 | 否 | 否 | Node.js |
| MediaRecorder 实时流 | RecordRTC, Screenity | 不精确 | 否 | 支持 | 浏览器 |
| Canvas + WebCodecs | canvas-record | 精确 | 是（浏览器内） | 否 | Chromium |
| React + Puppeteer | Remotion | 精确 | 部分 | 支持 | Node.js |

---

## 九、对 nf-recorder 的定位结论

**nf-recorder 的核心优势在于：**

1. **帧驱动协议**（`window.__onFrame`）而非实时流录制 — 消除丢帧，保证帧精度。
2. **WKWebView** 替代 Chrome — macOS 原生，无需安装 Chromium，无沙箱限制。
3. **Rust + VideoToolbox** 编码 — 性能远超 WASM 方案，与原生 FFmpeg 持平。
4. **并行录制**内置在 `api/parallel.rs` — 无需外部分布式框架。

**主要差距（与竞品相比）：**

- 仅支持 macOS（WKWebView 限制）；Chrome 方案天然跨平台。
- CSS 动画支持依赖 WebKit；复杂 CSS filter 行为与 Blink 有细微差异。
- 无浏览器端 WebCodecs 路径；如需在浏览器内预览编码质量，需另行设计。

---

*调研时间：2026-04-14*
