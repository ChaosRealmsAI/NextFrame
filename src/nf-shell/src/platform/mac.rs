#![cfg(target_os = "macos")]

use anyhow::{Context, Result};
use serde_json::Value;
use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::window::Window;
use wry::WebView;

use super::ShellWebView;

#[allow(dead_code)]
impl ShellWebView for (&Window, &WebView) {
    fn eval_async(&self, js: &str) -> Result<Value> {
        self.1.evaluate_script(js).context("webview eval")?;
        Ok(Value::Null)
    }

    fn inject(&self, script: &str) -> Result<()> {
        self.1.evaluate_script(script).context("webview inject")
    }

    fn snapshot(&self) -> Result<Vec<u8>> {
        anyhow::bail!("macOS preview snapshot not wired in nf-shell v1.58")
    }

    fn set_bounds(&self, x: f64, y: f64, w: f64, h: f64) {
        self.0
            .set_outer_position(PhysicalPosition::new(x as i32, y as i32));
        self.0.set_inner_size(LogicalSize::new(w, h));
    }
}

macro_rules! build_platform_window {
    (
        $event_loop:expr,
        $title:expr,
        $window_w:expr,
        $window_h:expr,
        $window_x:expr,
        $window_y:expr,
        $min_w:expr,
        $min_h:expr,
        $inset_x:expr,
        $inset_y:expr
    ) => {{
        let window = tao::window::WindowBuilder::new()
            .with_title($title)
            .with_inner_size(tao::dpi::LogicalSize::new($window_w, $window_h))
            .with_position(tao::dpi::LogicalPosition::new($window_x, $window_y))
            .with_resizable(true)
            .with_min_inner_size(tao::dpi::LogicalSize::new($min_w, $min_h))
            .with_title_hidden(true)
            .with_titlebar_transparent(true)
            .with_fullsize_content_view(true)
            .with_has_shadow(true)
            .with_traffic_light_inset(tao::dpi::LogicalPosition::new($inset_x, $inset_y))
            .build($event_loop)
            .context("window build")?;
        window.set_focus();
        window
    }};
}

pub(crate) use build_platform_window;

macro_rules! build_platform_webview {
    ($window:expr, $html:expr, $init_script:expr, $protocol_handler:expr, $ipc_handler:expr $(,)?) => {{
        wry::WebViewBuilder::new($window)
            .with_asynchronous_custom_protocol("nf-asset".to_string(), $protocol_handler)
            .with_html($html)
            .with_initialization_script($init_script)
            .with_devtools(true)
            .with_ipc_handler($ipc_handler)
            .build()
            .context("webview build")?
    }};
}

pub(crate) use build_platform_webview;
