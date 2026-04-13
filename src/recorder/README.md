# NextFrame Recorder

HTML → MP4 录制器。逐帧截图，不是屏幕录制。

## 原理

```
HTML 加载到 WKWebView → 逐帧 __onFrame({time}) → CALayer 截图 → AVAssetWriter H.264 编码 → MP4
```

帧精确，不丢帧，不受机器速度影响。

## 安装

```bash
cargo build --release -p nextframe-recorder --features cli
# 二进制在 target/release/nextframe-recorder
```

## 快速使用

```bash
# 最简单
nextframe-recorder slide video.html --out video.mp4

# 竖屏 1080p 60fps（推荐）
nextframe-recorder slide video.html --out video.mp4 --width 540 --height 960 --dpr 2 --fps 60

# 横屏 1080p 60fps
nextframe-recorder slide video.html --out video.mp4 --width 1920 --height 1080 --dpr 1 --fps 60

# 4K 60fps（慢，建议加 --parallel）
nextframe-recorder slide video.html --out video.mp4 --width 1920 --height 1080 --dpr 2 --fps 60 --parallel 4
```

## 参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `--width` | 540 | CSS 视口宽（像素） |
| `--height` | 960 | CSS 视口高（像素） |
| `--dpr` | 2.0 | 设备像素比。输出分辨率 = width×dpr × height×dpr |
| `--fps` | 30 | 输出帧率 |
| `--crf` | 14 | H.264 画质（越低越好，14≈视觉无损，23≈普通） |
| `--parallel` | — | 并行进程数。单 HTML 自动帧切片并行 |
| `--no-skip` | false | 禁用帧跳过（每帧都截图） |
| `--headed` | false | 显示录制窗口（调试用） |
| `--out` | output.mp4 | 输出路径 |

## 常用组合

```bash
# 竖屏 1080p 60fps — 最常用，速度快
--width 540 --height 960 --dpr 2 --fps 60

# 横屏 1080p 30fps — 平衡
--width 1920 --height 1080 --dpr 1 --fps 30

# 横屏 4K 60fps — 最高质量，加并行
--width 1920 --height 1080 --dpr 2 --fps 60 --parallel 4

# 横屏 4K 30fps — 质量优先，速度折中
--width 1920 --height 1080 --dpr 2 --fps 30
```

## 实测速度（M 系列 10 核）

### 串行

| 输出分辨率 | fps | 30fps 帧率 | 60fps 帧率 | 说明 |
|-----------|-----|-----------|-----------|------|
| 960×540 | 30 | 73 fps | — | 飞快 |
| 1080×1920 竖屏 | 60 | — | 56 fps | **比实时快** |
| 1920×1080 横屏 | 30 | 31 fps | — | 实时 |
| 1920×1080 横屏 | 60 | — | 25-29 fps | 接近实时 |
| 3840×2160 4K | 60 | — | 5.8 fps | 慢，用并行 |

### 并行（4K 60fps）

| 进程数 | fps | 18s 视频耗时 | 加速比 |
|--------|-----|-------------|-------|
| 1 | 5.8 | 190s | 1x |
| 2 | 8.7 | 127s | 1.5x |
| 4 | 13.0 | 86s | 2.2x |
| 8 | 14.0 | 79s | 2.4x |

### 不同内容复杂度（1920×1080 30fps）

| 内容 | fps | 说明 |
|------|-----|------|
| 简单文字动画 | 31 fps | 比实时快 |
| 中等图形 | 25-28 fps | 接近实时 |
| 复杂 shader/多层 | 5-10 fps | 慢 |

## 自动功能

### 时长检测
v0.3 HTML 的 `engine.duration` 自动检测，不需要手动指定。

### 音频
自动检测 `audioTrack` 组件的 `window.__audioSrc`，mux 到 MP4。

### 内嵌视频
自动检测 `videoClip` 组件，录制后 ffmpeg overlay 源视频到对应位置。

### 帧跳过
静态内容自动跳过未变化的帧（复用上一帧截图），节省 80-99% 截图时间。

## HTML 协议

HTML 需要实现 `window.__onFrame(data)` 接口：

```js
window.__onFrame = function(frame) {
  // frame.time — 当前时间（秒）
  // frame.progress — 进度百分比
  // frame.cue — 当前 cue 索引
  // frame.subtitle — 当前字幕文本
  renderFrame(frame.time);  // 渲染到该时间点
  return true;
};
```

v0.3 引擎的 `createEngine()` 已自动注册此接口。

## 多文件录制

```bash
# 多个 HTML 串行录制，拼接成一个 MP4
nextframe-recorder slide slide1.html slide2.html slide3.html --out combined.mp4

# 目录下所有 HTML
nextframe-recorder slide --dir slides/ --out combined.mp4

# 多文件并行
nextframe-recorder slide --dir slides/ --out combined.mp4 --parallel 4
```

## 性能瓶颈

录制速度取决于 `CALayer.renderInContext`（CPU 光栅化 WebView 画面）：
- 像素越多越慢（4K = 4× 像素 = 4× 慢）
- DOM 层数越多越慢
- **并行是唯一有效的加速手段**

已验证无效的路线：IOSurface 直读、ScreenCaptureKit、低分辨率渲染+放大。
