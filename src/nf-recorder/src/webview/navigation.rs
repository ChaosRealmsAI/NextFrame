//! webview navigation helpers
use std::path::Path;
use std::time::{Duration, Instant};

use objc2_foundation::{NSString, NSURL, NSURLRequest};

use super::WebViewHost;
use super::frame::pump_main_run_loop;
use crate::error_with_fix;

impl WebViewHost {
    /// Loads an HTTP URL into the hosted `WKWebView`.
    pub fn load_url(&self, url: &str) -> Result<(), String> {
        let url = NSURL::URLWithString(&NSString::from_str(url)).ok_or_else(|| {
            error_with_fix(
                "load the target URL into WKWebView",
                format!("failed to construct an NSURL from {url:?}"),
                "Pass a valid absolute URL such as `http://127.0.0.1:PORT/...` and retry.",
            )
        })?;
        let request = NSURLRequest::requestWithURL(&url);
        // SAFETY: `self.web_view` and `request` are live Objective-C objects for this load call.
        let navigation = unsafe { self.web_view.loadRequest(&request) }; // SAFETY: see above.
        if navigation.is_none() {
            return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                "load the target URL into WKWebView",
                format!(
                    "WKWebView refused loadRequest for {}",
                    url.absoluteString()
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "<invalid-url>".into())
                ),
                "Verify the URL is reachable from the local recorder webview and retry.",
            ));
        }
        self.window.displayIfNeeded();
        Ok(())
    }

    /// Loads a local file URL with the supplied read-access root.
    pub fn load_file_url(&self, file_path: &Path, read_access_root: &Path) -> Result<(), String> {
        let file_url = NSURL::fileURLWithPath(&NSString::from_str(&file_path.to_string_lossy()));
        let read_access_url =
            NSURL::fileURLWithPath(&NSString::from_str(&read_access_root.to_string_lossy()));
        // SAFETY: `self.web_view`, `file_url`, and `read_access_url` are live for this load call.
        let navigation = unsafe { // SAFETY: see above.
            // SAFETY: see above.
            self.web_view
                .loadFileURL_allowingReadAccessToURL(&file_url, &read_access_url)
        };
        if navigation.is_none() {
            return Err(/* Fix: user-facing error formatted below */ error_with_fix(
                "load the local frame file into WKWebView",
                format!(
                    "WKWebView refused loadFileURL for {} with read access {}",
                    file_path.display(),
                    read_access_root.display()
                ),
                "Ensure the frame file exists under the allowed read-access root and retry.",
            ));
        }
        self.window.displayIfNeeded();
        Ok(())
    }

    /// Waits until the page has reached a stable ready state for capture.
    pub fn wait_until_ready(&self, timeout: Duration) -> Result<(), String> {
        let started = Instant::now();
        let mut last_ready_state = None;
        let mut last_progress = 0.0;
        let mut last_loading = true;
        let mut last_url = None;
        let mut saw_navigation = false;
        while started.elapsed() < timeout {
            self.sync_view_hierarchy();
            // SAFETY: `self.web_view` is live, and `isLoading` is a side-effect-free query.
            last_loading = unsafe { self.web_view.isLoading() }; // SAFETY: see above.
            // SAFETY: `self.web_view` is live, and `estimatedProgress` is a side-effect-free query.
            last_progress = unsafe { self.web_view.estimatedProgress() }; // SAFETY: see above.
            last_url = self.current_url();
            saw_navigation |= last_loading
                || last_progress > 0.0
                || last_url
                    .as_deref()
                    .is_some_and(|url| !url.is_empty() && url != "about:blank");
            last_ready_state = self
                .eval_string("document.readyState ? String(document.readyState) : null")
                .ok()
                .flatten();

            if !last_loading
                && last_progress >= 1.0
                && matches!(last_ready_state.as_deref(), Some("complete"))
            {
                self.wait_for_animation_frame(timeout.saturating_sub(started.elapsed()))?;
                self.flush_render(Duration::from_millis(50))?;
                self.park_offscreen();
                return Ok(());
            }
            if saw_navigation
                && !last_loading
                && matches!(last_ready_state.as_deref(), Some("complete"))
                && started.elapsed() >= Duration::from_secs(1)
            {
                self.wait_for_animation_frame(timeout.saturating_sub(started.elapsed()))?;
                self.flush_render(Duration::from_millis(50))?;
                self.park_offscreen();
                return Ok(());
            }
            if !last_loading
                && last_progress == 0.0
                && last_url.is_none()
                && last_ready_state.is_none()
                && started.elapsed() >= Duration::from_millis(1500)
            {
                self.flush_render(Duration::from_millis(1500))?;
                let _ = self.wait_for_animation_frame(Duration::from_millis(500));
                self.park_offscreen();
                return Ok(());
            }
            pump_main_run_loop(Duration::from_millis(25));
        }
        Err(/* Fix: user-facing error formatted below */ error_with_fix(
            "wait for the page to finish loading",
            format!(
                "timed out waiting for page load (readyState={last_ready_state:?}, estimatedProgress={last_progress:.3}, isLoading={last_loading}, url={last_url:?})"
            ),
            "Retry after simplifying the page load or ensuring local assets are reachable.",
        ))
    }

    /// Applies recorder-specific DOM adjustments before capture begins.
    pub fn prepare_page(&self) -> Result<(), String> {
        let script = r#"
        (() => {
          document.documentElement.style.overflow = 'hidden';
          if (document.body) {
            document.body.style.overflow = 'hidden';
            document.body.style.margin = '0';
          }
          const help = document.querySelector('.help');
          if (help) help.style.display = 'none';
          document.querySelectorAll('audio, video').forEach(el => {
            try {
              el.muted = true;
              // Don't pause video — videoClip scene seeks it per frame via __onFrame.
              // Only pause audio elements (audio is muxed by ffmpeg separately).
              if (el.tagName === 'AUDIO') { el.pause(); el.currentTime = 0; }
            } catch (_) {}
          });
          return 'ok';
        })()
        "#;
        let started = Instant::now();
        let mut last_error = None;
        while started.elapsed() < Duration::from_secs(5) {
            match self.eval_ignoring_result(script) {
                Ok(()) => {
                    let on_frame_check = self.eval_string(
                        r#"
                        (() => {
                          return typeof window.__onFrame === 'function' ? 'ok' : 'missing';
                        })()
                        "#,
                    )?;
                    if on_frame_check.as_deref() == Some("missing") {
                        trace_log!(
                            "warning: page is missing window.__onFrame after load; recorder output may stay static until the page defines it"
                        );
                    }
                    return self.flush_render(Duration::from_millis(120));
                }
                Err(error) /* Internal: handled or logged locally below */ => {
                    last_error = Some(error);
                    self.flush_render(Duration::from_millis(100))?;
                }
            }
        }
        Err(/* Fix: user-facing error formatted below */ error_with_fix(
            "prepare the page for recording",
            format!(
                "failed to run the recorder DOM setup after load: {}",
                last_error.unwrap_or_else(|| "unknown JS error".into())
            ),
            "Ensure the page JS can run after load and that `window.__onFrame` is defined before capture begins.",
        ))
    }
}

/// Converts a file path under the server root into a percent-encoded HTTP URL.
pub fn relative_http_url(base_url: &str, root: &Path, file_path: &Path) -> Result<String, String> {
    let relative = file_path.strip_prefix(root).map_err(|_| {
        error_with_fix(
            "build the recorder HTTP URL",
            format!(
                "{} is not under server root {}",
                file_path.display(),
                root.display()
            ),
            "Place the frame file under the detected server root or retry with frames from one project tree.",
        )
    })?;
    let mut encoded = String::new();
    for (index, component) in relative.components().enumerate() {
        if index > 0 {
            encoded.push('/');
        }
        let text = component.as_os_str().to_string_lossy();
        encode_path_component(&mut encoded, &text);
    }
    Ok(format!("{base_url}/{encoded}"))
}

fn encode_path_component(output: &mut String, text: &str) {
    for byte in text.bytes() {
        let allowed = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if allowed {
            output.push(byte as char);
        } else {
            output.push('%');
            output.push_str(&format!("{byte:02X}"));
        }
    }
}
