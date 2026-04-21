#![deny(unsafe_op_in_unsafe_fn)]
//! nf-shell-mac · v1.14 headless recorder host
//!
//! 本 crate 是 `DesktopShell` trait 的 macOS 实现骨架。
//! 本 task (T-01) 只定义 trait / config / error / 4 个占位 mod。
//! 具体实现分散到后续 task：
//! - T-05 填 `MacHeadlessShell` + WKWebView host
//! - T-06 填 CARenderer 采样 + IOSurface helper
//!
//! trait 签名对齐 `spec/versions/v1.14/spec/interfaces-delta.json`
//! 的 `additions.traits[DesktopShell]`。

use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;

pub mod carenderer; // Layer 2 T-06 填 CARenderer 采样
pub mod headless; // Layer 2 T-05 填 MacHeadlessShell
pub mod iosurface; // Layer 2 T-06 填 IOSurface helper
pub mod webview; // Layer 2 T-05 填 WKWebView host

// 重新导出给外部用
pub use headless::MacHeadlessShell;
pub use iosurface::{IOSurfaceHandle, IoError};

/// 定义在 `interfaces-delta.json` `additions.traits[DesktopShell]`。
///
/// 5 个方法 · 跨平台 shell 抽象：
/// - `new_headless`：创建离屏 shell（NSWindow orderOut + origin=-5000）
/// - `load_bundle`：加载 bundle.html（file:// URL）
/// - `call_async`：走 WKWebView `callAsyncJavaScript` · 返 `serde_json::Value`
/// - `snapshot`：CARenderer 采样 WKWebView.layer 拿 IOSurface（zero-copy）
/// - `on_bridge_message`：监 `window.webkit.messageHandlers.nfBridge`
pub trait DesktopShell: Send + Sync {
    /// 创建 headless shell · NSWindow orderOut + origin=-5000 · WKWebView child。
    fn new_headless(config: ShellConfig) -> Result<Self, ShellError>
    where
        Self: Sized;

    /// 加载 bundle.html（file:// 或 绝对路径）。
    fn load_bundle(&self, path: &Path) -> Result<(), ShellError>;

    /// 走 `callAsyncJavaScript` 执行 JS · resolve 值封 `serde_json::Value` 返回。
    ///
    /// 对齐 `interfaces-delta.json` 的 `async fn call_async(...)` 语义 ·
    /// 实现方式：返 `Pin<Box<dyn Future + Send>>` · 让 trait 保持 object-safe。
    fn call_async<'a>(
        &'a self,
        script: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<serde_json::Value, ShellError>> + Send + 'a>>;

    /// 从 CARenderer 采样 WKWebView.layer 拿 IOSurface handle（zero-copy）。
    fn snapshot(&self) -> Result<IOSurfaceHandle, ShellError>;

    /// 注册 bridge message handler · 监 `window.webkit.messageHandlers.nfBridge`。
    ///
    /// handler 不能阻塞 —— 由底层在 main thread 同步回调。
    fn on_bridge_message<F>(&self, handler: F)
    where
        F: Fn(&str, &serde_json::Value) + Send + Sync + 'static;
}

/// Shell 创建配置。对齐 `interfaces-delta.json` `config_struct`。
#[derive(Debug, Clone)]
pub struct ShellConfig {
    /// 视口像素尺寸 (width, height)。
    pub viewport: (u32, u32),
    /// 设备像素比 (1.0 / 2.0 / 3.0 ...)。
    pub device_pixel_ratio: f32,
    /// bundle.html 的绝对路径或 file:// URL base。
    pub bundle_url: PathBuf,
}

/// Shell 错误枚举。对齐 `interfaces-delta.json` `error_enum` · 4 个 variant。
#[derive(Debug, thiserror::Error)]
pub enum ShellError {
    #[error("bundle load failed: {0}")]
    BundleLoadFailed(String),
    #[error("js call failed: {0}")]
    JsCallFailed(String),
    #[error("snapshot failed: {0}")]
    SnapshotFailed(String),
    #[error("unsupported platform")]
    UnsupportedPlatform,
}
