use anyhow::Result;
use serde_json::Value;

#[allow(dead_code)]
pub trait ShellWebView {
    fn eval_async(&self, js: &str) -> Result<Value>;
    fn inject(&self, script: &str) -> Result<()>;
    fn snapshot(&self) -> Result<Vec<u8>>;
    fn set_bounds(&self, x: f64, y: f64, w: f64, h: f64);
}

#[cfg(all(unix, not(target_vendor = "apple")))]
mod linux;
#[cfg(target_vendor = "apple")]
mod mac;
#[cfg(windows)]
mod win;

#[cfg(all(unix, not(target_vendor = "apple")))]
pub(crate) use self::linux::{build_platform_webview, build_platform_window, LinuxShellWebView};
#[cfg(target_vendor = "apple")]
pub(crate) use self::mac::{build_platform_webview, build_platform_window};
#[cfg(windows)]
pub(crate) use self::win::{build_platform_webview, build_platform_window, WinShellWebView};
