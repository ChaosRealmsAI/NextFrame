use std::cell::RefCell;
use std::rc::Rc;

use anyhow::{anyhow, Context, Result};
use javascriptcore::ValueExt as JsValueExt;
use serde_json::{Number, Value};
use tao::window::Window;
use webkit2gtk::{prelude::*, SnapshotOptions, SnapshotRegion};
use wry::{dpi::LogicalPosition, dpi::LogicalSize, Rect, WebView, WebViewExtUnix};

use super::ShellWebView;

pub struct LinuxShellWebView<'a> {
    window: &'a Window,
    webview: &'a WebView,
}

impl<'a> LinuxShellWebView<'a> {
    pub fn new(window: &'a Window, webview: &'a WebView) -> Self {
        Self { window, webview }
    }

    fn inner_webview(&self) -> webkit2gtk::WebView {
        self.webview.webview()
    }

    fn run_blocking<T, F>(&self, start: F) -> Result<T>
    where
        T: 'static,
        F: FnOnce(Box<dyn FnOnce(Result<T>) + 'static>),
    {
        let result = Rc::new(RefCell::new(None));
        let main_loop = webkit2gtk::glib::MainLoop::new(None, false);
        let result_slot = Rc::clone(&result);
        let main_loop_quit = main_loop.clone();

        start(Box::new(move |value| {
            *result_slot.borrow_mut() = Some(value);
            main_loop_quit.quit();
        }));

        if result.borrow().is_none() {
            main_loop.run();
        }

        result
            .borrow_mut()
            .take()
            .unwrap_or_else(|| Err(anyhow!("webkit2gtk async callback dropped")))
    }
}

impl ShellWebView for LinuxShellWebView<'_> {
    fn eval_async(&self, js: &str) -> Result<Value> {
        let webview = self.inner_webview();
        self.run_blocking(move |done| {
            webview.evaluate_javascript(
                js,
                None,
                Some("nf-shell://eval"),
                None::<&webkit2gtk::gio::Cancellable>,
                move |result| {
                    done(
                        result
                            .map_err(anyhow::Error::from)
                            .map(|value| javascript_value_to_json(&value)),
                    );
                },
            );
        })
        .context("webkit2gtk eval")
    }

    fn inject(&self, script: &str) -> Result<()> {
        self.webview
            .evaluate_script(script)
            .context("webkit2gtk inject")
    }

    fn snapshot(&self) -> Result<Vec<u8>> {
        let webview = self.inner_webview();
        self.run_blocking(move |done| {
            webview.snapshot(
                SnapshotRegion::Visible,
                SnapshotOptions::NONE,
                None::<&webkit2gtk::gio::Cancellable>,
                move |result| {
                    done(
                        result
                            .map_err(anyhow::Error::from)
                            .and_then(surface_to_png_bytes),
                    );
                },
            );
        })
        .context("webkit2gtk snapshot")
    }

    fn set_bounds(&self, x: f64, y: f64, w: f64, h: f64) {
        let _ = self.webview.set_bounds(Rect {
            position: LogicalPosition::new(x, y).into(),
            size: LogicalSize::new(w.max(0.0), h.max(0.0)).into(),
        });
        self.window.request_redraw();
    }
}

fn javascript_value_to_json(value: &javascriptcore::Value) -> Value {
    if value.is_null() || value.is_undefined() {
        return Value::Null;
    }

    if let Some(json) = value.to_json(0) {
        if let Ok(parsed) = serde_json::from_str::<Value>(json.as_str()) {
            return parsed;
        }
    }

    if value.is_boolean() {
        return Value::Bool(value.to_boolean());
    }

    if value.is_number() {
        if let Some(number) = Number::from_f64(value.to_double()) {
            return Value::Number(number);
        }
    }

    Value::String(value.to_str().to_string())
}

fn surface_to_png_bytes(surface: cairo::Surface) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    surface
        .write_to_png(&mut bytes)
        .map_err(|err| anyhow!("encode snapshot png: {err}"))?;
    if bytes.is_empty() {
        anyhow::bail!("webkit2gtk snapshot produced empty png");
    }
    Ok(bytes)
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
        let _ = ($inset_x, $inset_y);
        let window = tao::window::WindowBuilder::new()
            .with_title($title)
            .with_inner_size(tao::dpi::LogicalSize::new($window_w, $window_h))
            .with_position(tao::dpi::LogicalPosition::new($window_x, $window_y))
            .with_resizable(true)
            .with_min_inner_size(tao::dpi::LogicalSize::new($min_w, $min_h))
            .with_decorations(false)
            .build($event_loop)
            .context("window build")?;
        window.set_focus();
        window
    }};
}

pub(crate) use build_platform_window;

macro_rules! build_platform_webview {
    ($window:expr, $html:expr, $init_script:expr, $protocol_handler:expr, $ipc_handler:expr $(,)?) => {{
        use gtk::prelude::*;
        use tao::platform::unix::WindowExtUnix;
        use wry::{
            dpi::LogicalPosition, dpi::LogicalSize, Rect, WebViewBuilder, WebViewBuilderExtUnix,
        };

        let vbox = $window.default_vbox().context("gtk default_vbox missing")?;
        let fixed = gtk::Fixed::new();
        fixed.set_hexpand(true);
        fixed.set_vexpand(true);
        vbox.pack_start(&fixed, true, true, 0);
        fixed.show_all();

        let size = $window
            .inner_size()
            .to_logical::<u32>($window.scale_factor());
        WebViewBuilder::new_gtk(&fixed)
            .with_bounds(Rect {
                position: LogicalPosition::new(0, 0).into(),
                size: LogicalSize::new(size.width, size.height).into(),
            })
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
