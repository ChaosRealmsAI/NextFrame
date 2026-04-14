//! api parallel page probing
use std::path::{Path, PathBuf};
use std::time::Duration;

use objc2::MainThreadMarker;

#[derive(Default)]
pub(super) struct PageProbe {
    pub(super) duration_sec: Option<f64>,
    pub(super) audio_path: Option<PathBuf>,
    pub(super) video_layers_count: usize,
}

/// Quick probe: load HTML in a temporary WebView and query runtime metadata.
pub(super) fn probe_page(html_path: &Path, cli: &crate::CommonArgs) -> PageProbe {
    let Some(mtm) = MainThreadMarker::new() else {
        return PageProbe::default();
    };
    let Ok(host) = crate::webview::WebViewHost::new(mtm, false, cli.dpr, cli.width, cli.height)
    else {
        return PageProbe::default();
    };

    let root = html_path.parent().unwrap_or_else(|| Path::new("."));
    let Ok(root) = root.canonicalize() else {
        return PageProbe::default();
    };
    let server = crate::server::HttpFileServer::start(root.clone()).ok();
    if let Some(ref server) = server {
        let Ok(url) = crate::webview::relative_http_url(&server.base_url(), &root, html_path)
        else {
            return PageProbe::default();
        };
        if host.load_url(&url).is_err() {
            return PageProbe::default();
        }
    } else if host.load_file_url(html_path, &root).is_err() {
        return PageProbe::default();
    }
    if host.wait_until_ready(Duration::from_secs(15)).is_err() {
        return PageProbe::default();
    }
    if host.prepare_page().is_err() {
        return PageProbe::default();
    }
    std::thread::sleep(Duration::from_millis(200));

    let duration_sec = host.query_page_duration();
    let segment_titles = [String::from("segment")];
    let segment_durations = [duration_sec.unwrap_or(0.0)];
    let _ = host.inject_state(0, "", 0.0, 0, 1, &segment_titles, &segment_durations, 0.0);
    let _ = host.flush_render(Duration::from_millis(200));
    let video_layers_count = host.query_video_layers().len();
    let server_base_url = server.as_ref().map(|server| server.base_url());
    let audio_path = host.query_page_audio_src().and_then(|src| {
        crate::record::resolve_media_src(&src, server_base_url.as_deref(), &root, html_path)
    });

    PageProbe {
        duration_sec,
        audio_path,
        video_layers_count,
    }
}
