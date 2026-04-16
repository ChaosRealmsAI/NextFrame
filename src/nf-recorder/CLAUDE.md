# nf-recorder (v2.0, skeleton)

**WKWebView 截帧 → VideoToolbox 硬编码 4K MP4**。Rust (objc2 + CoreVideo + VideoToolbox)。

## 目标硬指标

- 分辨率：3840 × 2160（4K UHD）
- 帧率：30 fps（首版）
- 编码：H.265 / HEVC（硬加速），或 H.264 兜底
- 音频：AAC（预渲染素材混音）
- 容器：MP4

## 核心流程

```
source.json → nf-core-engine → bundle.html
   ↓
recorder 拉起 WKWebView（离屏，record 模式）
   ↓
for t in 0..duration step 1/fps:
    webview.eval("__nfSeek(" + t + ")")
    pb = webview.captureToCVPixelBuffer()  ← 核心难点 1
    assetWriter.append(pb, t)
audio:
    混合 getStateAt 返回的素材引用 → AAC
合成：
    VideoToolbox AVAssetWriter mux → output.mp4
```

## 3 大技术难点（POC 阶段需验证）

1. **WKWebView → CVPixelBuffer 零拷贝**（或最快拷贝路径）
2. **WKWebView 4K 渲染不掉帧 / 不降采样**（layer.contentsScale 陷阱）
3. **单 WebView 串行截帧 vs 并行 WebView** 的权衡（legacy-v08 的 parallel 有 bug）

## 边界

- ❌ 不解析 timeline / 不操作 source — 只吃 `bundle.html + duration`
- ❌ 不做画面合成 — WebView 出啥我录啥
- ✅ 负责：离屏 WebView、逐帧 seek、截帧、编码、mux
- ✅ 产出：`output.mp4` + 结构化日志（fps / 丢帧 / 编码耗时）

## 骨架阶段

`Cargo.toml` + `src/lib.rs` + `src/main.rs` 占位。无 objc2 依赖 — 保持最小壳编译过。

**骨架阶段仅占位。**
