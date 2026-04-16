//! nf-recorder (v2.0, skeleton) — WKWebView 截帧 → VideoToolbox → 4K MP4.
//!
//! 4K 目标：3840 × 2160 @ 30fps，硬编码（VideoToolbox / H.265 硬加速）。
//!
//! 流程：
//!   1. 加载 bundle.html 到 WKWebView（record 模式）
//!   2. 按帧循环：JS eval `__nfSeek(t)` → `__nfScreenshot()` → CVPixelBuffer
//!   3. VideoToolbox AVAssetWriter 喂帧 → MP4
//!   4. 预渲染音频素材（getStateAt 返回的引用）混音 → AAC 合入
//!
//! 骨架阶段：仅占位，后续实现。

pub fn version() -> &'static str {
    "0.1.0-skeleton"
}
