use std::time::Instant;

use serde_json::Value;
use wry::WebView;

use crate::app_control::{PendingAppCtlMap, PendingAppCtlRequest};

pub(crate) fn queue_appctl_script(
    webview: &WebView,
    source: &str,
    stream: &mut std::net::TcpStream,
    pending_appctl: &PendingAppCtlMap,
    next_request_id: &mut u64,
    success_content_type: &'static str,
) -> Result<(), String> {
    let req_id = next_appctl_request_id(next_request_id);
    let script = appctl_eval_script(&req_id, source)?;
    let owned_stream = stream
        .try_clone()
        .map_err(|error| format!("failed to clone response stream: {error}"))?;

    match pending_appctl.lock() {
        Ok(mut requests) => {
            requests.insert(
                req_id.clone(),
                PendingAppCtlRequest {
                    stream: owned_stream,
                    success_content_type,
                    started_at: Instant::now(),
                },
            );
        }
        Err(error) => {
            return Err(format!("pending request state poisoned: {error}"));
        }
    }

    if let Err(error) = webview.evaluate_script(&script) {
        if let Ok(mut requests) = pending_appctl.lock() {
            requests.remove(&req_id);
        }
        return Err(format!("failed to evaluate app control script: {error}"));
    }

    Ok(())
}

fn next_appctl_request_id(counter: &mut u64) -> String {
    *counter += 1;
    format!("nf-appctl-{}-{counter}", crate::screenshot::now_unix_millis())
}

fn appctl_eval_script(req_id: &str, source: &str) -> Result<String, String> {
    let req_id_json = serde_json::to_string(req_id)
        .map_err(|error| format!("failed to encode reqId: {error}"))?;
    let source_json = serde_json::to_string(source)
        .map_err(|error| format!("failed to encode script source: {error}"))?;
    Ok(format!(
        r#"(function() {{
  var __nfReqId = {req_id_json};
  var __nfSource = {source_json};
  function __nfReply(ok, value) {{
    if (typeof window.__nfAppCtlRespond === "function") {{
      window.__nfAppCtlRespond(__nfReqId, ok, value);
      return;
    }}
    throw new Error("window.__nfAppCtlRespond is unavailable");
  }}
  try {{
    Promise.resolve((0, eval)(__nfSource)).then(function(value) {{
      __nfReply(true, value);
    }}, function(error) {{
      __nfReply(false, error);
    }});
  }} catch (error) {{
    __nfReply(false, error);
  }}
}})();"#,
    ))
}

pub(crate) fn build_navigate_script(payload: &Value) -> Result<String, String> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|error| format!("failed to encode navigate payload: {error}"))?;
    Ok(format!(
        r#"(async function() {{
  var payload = {payload_json};
  var view = payload && typeof payload.view === "string" ? payload.view : null;
  var hasSegment = payload && Object.prototype.hasOwnProperty.call(payload, "segment");
  if (view === "project") {{
    await goProject(payload.project || null);
  }} else {{
    await goEditor(
      payload && typeof payload.project === "string" ? payload.project : null,
      payload && typeof payload.episode === "string" ? payload.episode : null,
      hasSegment && typeof payload.segment === "string" ? payload.segment : null
    );
  }}
  if (typeof window.__diagnose === "function") {{
    try {{
      return JSON.parse(window.__diagnose());
    }} catch (_) {{
      return window.__diagnose();
    }}
  }}
  return {{
    view: view || "editor",
    project: payload && payload.project ? payload.project : null,
    episode: payload && payload.episode ? payload.episode : null,
    segment: hasSegment ? payload.segment : null
  }};
}})()"#,
    ))
}
