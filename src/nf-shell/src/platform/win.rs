use anyhow::Result;
use serde_json::Value;

use super::ShellWebView;

pub struct PlatformShell;

impl PlatformShell {
    pub fn drag_window(&self) -> Result<()> {
        bail!("nf-shell Windows platform shell is a v1.58 placeholder")
    }

    pub fn capture_rect(&self) -> (f64, f64, f64, f64) {
        (0.0, 0.0, 0.0, 0.0)
    }
}

impl ShellWebView for PlatformShell {
    fn eval_async(&self, _js: &str) -> Result<Value> {
        bail!("nf-shell Windows platform shell is a v1.58 placeholder")
    }

    fn inject(&self, _script: &str) -> Result<()> {
        bail!("nf-shell Windows platform shell is a v1.58 placeholder")
    }

    fn snapshot(&self) -> Result<Vec<u8>> {
        bail!("nf-shell Windows platform shell is a v1.58 placeholder")
    }

    fn set_bounds(&self, _x: f64, _y: f64, _w: f64, _h: f64) {}
}

macro_rules! build_platform_window {
    ($($tt:tt)*) => {{
        anyhow::bail!("nf-shell Windows platform shell is a v1.58 placeholder")
    }};
}

pub(crate) use build_platform_window;

macro_rules! build_platform_webview {
    ($($tt:tt)*) => {{
        anyhow::bail!("nf-shell Windows platform shell is a v1.58 placeholder")
    }};
}

pub(crate) use build_platform_webview;
