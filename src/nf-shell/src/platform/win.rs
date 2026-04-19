#![cfg(windows)]

use std::sync::mpsc;

use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use tao::window::Window;
use webview2_com::{
    AddScriptToExecuteOnDocumentCreatedCompletedHandler, CapturePreviewCompletedHandler,
    ExecuteScriptCompletedHandler, Microsoft::Web::WebView2::Win32::*,
};
use windows::{
    core::HSTRING,
    Win32::{
        Foundation::{HGLOBAL, RECT},
        System::{
            Com::{
                IStream,
                StructuredStorage::{CreateStreamOnHGlobal, GetHGlobalFromStream},
            },
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
        },
    },
};
use wry::{WebView, WebViewExtWindows};

use super::ShellWebView;

pub struct WinShellWebView<'a> {
    window: &'a Window,
    webview: &'a WebView,
}

impl<'a> WinShellWebView<'a> {
    pub fn new(window: &'a Window, webview: &'a WebView) -> Self {
        Self { window, webview }
    }

    fn controller(&self) -> ICoreWebView2Controller {
        self.webview.controller()
    }

    fn core_webview(&self) -> Result<ICoreWebView2> {
        unsafe { self.controller().CoreWebView2() }.context("CoreWebView2 handle")
    }
}

impl ShellWebView for WinShellWebView<'_> {
    fn eval_async(&self, js: &str) -> Result<Value> {
        execute_script_blocking(&self.core_webview()?, js)
    }

    fn inject(&self, script: &str) -> Result<()> {
        let webview = self.core_webview()?;
        add_document_script(&webview, script)?;
        let _ = execute_script_blocking(&webview, script)?;
        Ok(())
    }

    fn snapshot(&self) -> Result<Vec<u8>> {
        let webview = self.core_webview()?;
        let stream = unsafe { CreateStreamOnHGlobal(HGLOBAL::default(), true) }
            .context("CreateStreamOnHGlobal")?;
        let stream_for_capture = stream.clone();
        let webview_for_capture = webview.clone();

        CapturePreviewCompletedHandler::wait_for_async_operation(
            Box::new(move |handler| unsafe {
                webview_for_capture
                    .CapturePreview(
                        COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                        &stream_for_capture,
                        &handler,
                    )
                    .map_err(Into::into)
            }),
            Box::new(|status| status),
        )
        .map_err(webview2_error)
        .context("CapturePreview")?;

        stream_bytes(&stream)
    }

    fn set_bounds(&self, x: f64, y: f64, w: f64, h: f64) {
        let left = x.round() as i32;
        let top = y.round() as i32;
        let right = left + w.max(0.0).round() as i32;
        let bottom = top + h.max(0.0).round() as i32;
        let _ = unsafe {
            self.controller().SetBounds(RECT {
                left,
                top,
                right,
                bottom,
            })
        };
        self.window.request_redraw();
    }
}

fn add_document_script(webview: &ICoreWebView2, script: &str) -> Result<()> {
    let webview = webview.clone();
    let script = script.to_string();
    AddScriptToExecuteOnDocumentCreatedCompletedHandler::wait_for_async_operation(
        Box::new(move |handler| unsafe {
            webview
                .AddScriptToExecuteOnDocumentCreated(&HSTRING::from(script), &handler)
                .map_err(Into::into)
        }),
        Box::new(|status, _script_id| status),
    )
    .map_err(webview2_error)
    .context("AddScriptToExecuteOnDocumentCreated")?;
    Ok(())
}

fn execute_script_blocking(webview: &ICoreWebView2, js: &str) -> Result<Value> {
    let webview = webview.clone();
    let script = js.to_string();
    let (tx, rx) = mpsc::channel();
    ExecuteScriptCompletedHandler::wait_for_async_operation(
        Box::new(move |handler| unsafe {
            webview
                .ExecuteScript(&HSTRING::from(script), &handler)
                .map_err(Into::into)
        }),
        Box::new(move |status, raw| {
            let result = status
                .map_err(anyhow::Error::from)
                .and_then(|_| parse_script_result(&raw));
            let _ = tx.send(result);
            Ok(())
        }),
    )
    .map_err(webview2_error)
    .context("ExecuteScript")?;

    rx.recv().context("ExecuteScript callback dropped")?
}

fn parse_script_result(raw: &str) -> Result<Value> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(trimmed).or_else(|_| Ok(Value::String(raw.to_string())))
}

fn webview2_error(err: webview2_com::Error) -> anyhow::Error {
    anyhow!("WebView2 error: {err}")
}

fn stream_bytes(stream: &IStream) -> Result<Vec<u8>> {
    let hglobal = unsafe { GetHGlobalFromStream(stream) }.context("GetHGlobalFromStream")?;
    let size = unsafe { GlobalSize(hglobal) };
    if size == 0 {
        return Ok(Vec::new());
    }

    let ptr = unsafe { GlobalLock(hglobal) };
    if ptr.is_null() {
        return Err(anyhow!("GlobalLock returned null"));
    }

    let bytes = unsafe { std::slice::from_raw_parts(ptr.cast::<u8>(), size) }.to_vec();
    let _ = unsafe { GlobalUnlock(hglobal) };
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
