//! `headless` · macOS headless shell 实现入口。
//!
//! 本 mod 拆两层：
//! - `mac` · 真实 `MacHeadlessShell` · impl `DesktopShell`
//!
//! 外部只应该用 `MacHeadlessShell`（re-export 自 `mac`）。

pub mod mac;
pub use mac::MacHeadlessShell;
