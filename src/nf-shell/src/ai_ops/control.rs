//! ai control control server helpers
use std::collections::HashMap;
use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;
use wry::WebView;

use super::{
    build_navigate_script, decode_query_component, default_screenshot_path, error_with_fix,
    native_screenshot, query_value, queue_appctl_script, split_path_and_query,
};
use crate::ipc::{read_http_request, write_http_response, HttpConnection, HttpRequest};

pub(crate) type PendingAppCtlMap = Arc<Mutex<HashMap<String, PendingAppCtlRequest>>>;

pub(crate) struct PendingAppCtlRequest {
    pub(crate) stream: TcpStream,
    pub(crate) success_content_type: &'static str,
    pub(crate) started_at: Instant,
}

pub(crate) fn new_pending_appctl() -> PendingAppCtlMap {
    Arc::new(Mutex::new(HashMap::new()))
}

pub(crate) fn poll_app_control_server(
    listener: &TcpListener,
    connections: &mut Vec<HttpConnection>,
    webview: &WebView,
    pending_appctl: &PendingAppCtlMap,
    next_request_id: &mut u64,
) {
    loop {
        match listener.accept() {
            Ok((stream, addr)) => {
                if let Err(error) = stream.set_nonblocking(true) {
                    trace_log!("[appctl] failed to set non-blocking stream from {addr}: {error}");
                    continue;
                }
                connections.push(HttpConnection {
                    stream,
                    buffer: Vec::new(),
                    accepted_at: Instant::now(),
                });
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => break,
            Err(error) => {
                trace_log!("[appctl] accept failed: {error}");
                break;
            }
        }
    }

    let mut index = 0;
    while index < connections.len() {
        let parsed_request = {
            let connection = &mut connections[index];
            read_http_request(connection)
        };

        match parsed_request {
            Ok(Some(request)) => {
                let mut connection = connections.swap_remove(index);
                if let Err(error) = handle_http_request(
                    request,
                    &mut connection.stream,
                    webview,
                    pending_appctl,
                    next_request_id,
                ) {
                    trace_log!("[appctl] request handling failed: {error}");
                    let _ = write_http_response(
                        &mut connection.stream,
                        500,
                        "Internal Server Error",
                        "text/plain; charset=utf-8",
                        error.as_bytes(),
                    );
                }
            }
            Ok(None) => {
                if connections[index].accepted_at.elapsed() > Duration::from_secs(10) {
                    let mut connection = connections.swap_remove(index);
                    let _ = write_http_response(
                        &mut connection.stream,
                        408,
                        "Request Timeout",
                        "text/plain; charset=utf-8",
                        error_with_fix(
                            "read the app-control request",
                            "the request body was not received before the 10 second timeout",
                            "Send the full HTTP request promptly and retry.",
                        )
                        .as_bytes(),
                    );
                } else {
                    index += 1;
                }
            }
            Err(error) => {
                let mut connection = connections.swap_remove(index);
                let _ = write_http_response(
                    &mut connection.stream,
                    400,
                    "Bad Request",
                    "text/plain; charset=utf-8",
                    error.as_bytes(),
                );
            }
        }
    }

    prune_expired_appctl_requests(pending_appctl);
}
fn handle_http_request(
    request: HttpRequest,
    stream: &mut TcpStream,
    webview: &WebView,
    pending_appctl: &PendingAppCtlMap,
    next_request_id: &mut u64,
) -> Result<(), String> {
    let (path, query) = split_path_and_query(&request.path);
    match (request.method.as_str(), path) {
        ("GET", "/status") => {
            queue_appctl_script(
                webview,
                status_probe_script(),
                stream,
                pending_appctl,
                next_request_id,
                "application/json; charset=utf-8",
            )
        }
        ("GET", "/diagnose") => {
            queue_appctl_script(
                webview,
                diagnose_probe_script(),
                stream,
                pending_appctl,
                next_request_id,
                "application/json; charset=utf-8",
            )
        }
        ("POST", "/eval") => {
            let script = String::from_utf8(request.body)
                .map_err(|error| {
                    error_with_fix(
                        "read the /eval request body",
                        format!("the body was not valid UTF-8: {error}"),
                        "Send UTF-8 JavaScript source in the request body and retry.",
                    )
                })?;
            queue_appctl_script(
                webview,
                &script,
                stream,
                pending_appctl,
                next_request_id,
                "text/plain; charset=utf-8",
            )
        }
        ("POST", "/navigate") => {
            let payload = if request.body.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice::<Value>(&request.body)
                    .map_err(|error| {
                        error_with_fix(
                            "parse the /navigate request body",
                            error,
                            "Send valid JSON with the expected navigation fields and retry.",
                        )
                    })?
            };
            let navigation_script = build_navigate_script(&payload)?;
            queue_appctl_script(
                webview,
                &navigation_script,
                stream,
                pending_appctl,
                next_request_id,
                "application/json; charset=utf-8",
            )
        }
        ("GET", "/screenshot") => {
            let requested_path = match query_value(query, "out") {
                Some(raw_path) => Some(match decode_query_component(raw_path) {
                    Ok(path) => path,
                    Err(error) => {
                        return write_http_response(
                            stream,
                            400,
                            "Bad Request",
                            "text/plain; charset=utf-8",
                            error.as_bytes(),
                        )
                        .map_err(|write_error| {
                            error_with_fix(
                                "write the screenshot query error response",
                                write_error,
                                "Check the local HTTP connection and retry the screenshot request.",
                            )
                        });
                    }
                }),
                None => None,
            };
            let out_path = requested_path.unwrap_or_else(default_screenshot_path);
            if out_path.trim().is_empty() {
                return write_http_response(
                    stream,
                    400,
                    "Bad Request",
                    "text/plain; charset=utf-8",
                    b"missing screenshot output path",
                )
                .map_err(|error| {
                    error_with_fix(
                        "write the screenshot output-path error response",
                        error,
                        "Check the local HTTP connection and retry the screenshot request.",
                    )
                });
            }
            native_screenshot(webview, &out_path, stream)
        }
        _ => write_http_response(
            stream,
            404,
            "Not Found",
            "text/plain; charset=utf-8",
            error_with_fix(
                "route the app-control request",
                format!("no handler exists for {} {}", request.method, request.path),
                "Use one of the supported endpoints: /status, /diagnose, /eval, /navigate, or /screenshot.",
            )
            .as_bytes(),
        )
        .map_err(|error| {
            error_with_fix(
                "write the HTTP 404 response",
                error,
                "Check the local HTTP connection and retry the request.",
            )
        }),
    }
}

fn status_probe_script() -> &'static str {
    r#"(function() {
  function finiteNumber(value, fallback) {
    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function deriveClipTiming(clip) {
    var start = Math.max(0, finiteNumber(clip && clip.start, 0));
    var explicitDuration = finiteNumber(clip && (clip.dur != null ? clip.dur : clip.duration), NaN);
    var end = finiteNumber(clip && clip.end, NaN);
    var duration = Number.isFinite(explicitDuration)
      ? Math.max(0, explicitDuration)
      : Math.max(0, end - start);
    return { start: start, duration: duration };
  }

  function clipCount(timeline) {
    if (!timeline || typeof timeline !== "object") {
      return 0;
    }
    if (Array.isArray(timeline.layers)) {
      return timeline.layers.length;
    }
    if (!Array.isArray(timeline.tracks)) {
      return 0;
    }
    return timeline.tracks.reduce(function(total, track) {
      return total + (Array.isArray(track && track.clips) ? track.clips.length : 0);
    }, 0);
  }

  function timelineDuration(timeline) {
    if (!timeline || typeof timeline !== "object") {
      return 0;
    }
    var direct = finiteNumber(timeline.duration, 0);
    var meta = finiteNumber(timeline.meta && timeline.meta.duration, 0);
    var tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
    var layers = Array.isArray(timeline.layers) ? timeline.layers : [];
    var derivedTracks = tracks.reduce(function(maxEnd, track) {
      var clips = Array.isArray(track && track.clips) ? track.clips : [];
      return clips.reduce(function(clipMax, clip) {
        var timing = deriveClipTiming(clip);
        return Math.max(clipMax, timing.start + timing.duration);
      }, maxEnd);
    }, 0);
    var derivedLayers = layers.reduce(function(maxEnd, layer) {
      var timing = deriveClipTiming(layer);
      return Math.max(maxEnd, timing.start + timing.duration);
    }, 0);
    return Math.max(direct, meta, derivedTracks, derivedLayers);
  }

  function pageFromView(activeViewId) {
    if (activeViewId === "view-editor") {
      return "editor";
    }
    if (activeViewId === "view-pipeline") {
      return "pipeline";
    }
    if (activeViewId === "view-project") {
      return "project";
    }
    if (typeof activeViewId === "string" && activeViewId.indexOf("view-") === 0) {
      return activeViewId.slice("view-".length) || "unknown";
    }
    return "unknown";
  }

  var activeViewId = document.querySelector(".view.active")?.id || "none";
  var timeline = typeof currentTimeline !== "undefined" ? currentTimeline : null;

  return {
    page: pageFromView(activeViewId),
    project: typeof currentProject !== "undefined" ? currentProject : null,
    episode: typeof currentEpisode !== "undefined" ? currentEpisode : null,
    segment: typeof currentSegment !== "undefined" ? currentSegment : null,
    timeline_loaded: !!timeline,
    clip_count: clipCount(timeline),
    duration: timelineDuration(timeline),
    pipeline_stage: typeof pipelineStage !== "undefined" ? pipelineStage : null
  };
})()"#
}

fn diagnose_probe_script() -> &'static str {
    r#"(function() {
  if (typeof window.__diagnose === "function") {
    try {
      return JSON.parse(window.__diagnose());
    } catch (_) {
      return window.__diagnose();
    }
  }
  return {
    title: document.title || "NextFrame",
    location: String(window.location),
    viewActive: document.querySelector(".view.active")?.id || "none"
  };
})()"#
}

pub(crate) fn prune_expired_appctl_requests(pending_appctl: &PendingAppCtlMap) {
    let expired_ids = match pending_appctl.lock() {
        Ok(requests) => requests
            .iter()
            .filter_map(|(req_id, pending)| {
                if pending.started_at.elapsed() > Duration::from_secs(10) {
                    Some(req_id.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>(),
        Err(error) => {
            trace_log!("[appctl] pending request state poisoned: {error}");
            return;
        }
    };

    if expired_ids.is_empty() {
        return;
    }

    let mut expired_requests = Vec::new();
    if let Ok(mut requests) = pending_appctl.lock() {
        for req_id in expired_ids {
            if let Some(request) = requests.remove(&req_id) {
                expired_requests.push((req_id, request));
            }
        }
    }

    for (req_id, mut request) in expired_requests {
        trace_log!("[appctl] request timed out: {req_id}");
        let _ = write_http_response(
            &mut request.stream,
            504,
            "Gateway Timeout",
            "text/plain; charset=utf-8",
            error_with_fix(
                "evaluate the app-control request",
                format!("request {req_id} timed out after 10 seconds"),
                "Reduce the work in the evaluated script or retry after the UI becomes responsive.",
            )
            .as_bytes(),
        );
    }
}
