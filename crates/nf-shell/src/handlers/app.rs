use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tao::event_loop::{EventLoopProxy, EventLoopWindowTarget};
use tokio::sync::oneshot;

use crate::errors::NfError;
use crate::events::UserEvent;
use crate::ipc_server::{ok_response, IpcRequest, IpcResponse};
use crate::window_manager::WindowManager;

pub struct AppOpHandler;

impl AppOpHandler {
    pub fn open(
        manager: &mut WindowManager,
        target: &EventLoopWindowTarget<UserEvent>,
        proxy: &EventLoopProxy<UserEvent>,
        request: IpcRequest,
    ) -> IpcResponse {
        let result = (|| {
            let project = required_string(&request.params, "project")?;
            let episode = required_string(&request.params, "episode")?;
            let new_window = request
                .params
                .get("new_window")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let window_id = if new_window {
                manager.open_new(target, proxy, &project, &episode)?
            } else {
                manager.open(target, proxy, &project, &episode)?
            };
            Ok(json!({
                "window_id": window_id,
                "project": project,
                "episode": episode,
                "pid": std::process::id()
            }))
        })();

        response_from_result(request.req_id, result)
    }

    pub fn close(manager: &mut WindowManager, request: IpcRequest) -> IpcResponse {
        let result = (|| {
            let project = required_string(&request.params, "project")?;
            let episode = required_string(&request.params, "episode")?;
            let window = optional_string(&request.params, "window");
            let closed = manager.close_target(&project, &episode, window.as_deref())?;
            Ok(json!({ "closed": closed, "remaining": manager.list(None, None).len() }))
        })();

        response_from_result(request.req_id, result)
    }

    pub fn state_query(manager: &WindowManager, request: IpcRequest) -> IpcResponse {
        if request.params.get("tool").and_then(Value::as_str) == Some("devtools") {
            return error_response(
                request.req_id,
                "devtools queries must use the devtools-query op".to_string(),
            );
        }

        let query = request.params.get("query").and_then(Value::as_str);
        if query == Some("windows") {
            let project = optional_string(&request.params, "project");
            let episode = optional_string(&request.params, "episode");
            let windows = manager.list(project.as_deref(), episode.as_deref());
            return ok_response(
                &request,
                json!({ "windows": windows, "count": windows.len() }),
            );
        }

        let result = (|| {
            let project = required_string(&request.params, "project")?;
            let episode = required_string(&request.params, "episode")?;
            let key = required_string(&request.params, "key")?;
            let window = optional_string(&request.params, "window");
            let (window_id, _) =
                manager.webview_for_target(&project, &episode, window.as_deref())?;
            Ok(json!({
                "window_id": window_id,
                "project": project,
                "episode": episode,
                "key": key,
                "value": Value::Null
            }))
        })();

        response_from_result(request.req_id, result)
    }

    pub fn click(manager: &WindowManager, request: IpcRequest, ack: oneshot::Sender<IpcResponse>) {
        let shared_ack = shared_ack(ack);
        let result = (|| {
            let project = required_string(&request.params, "project")?;
            let episode = required_string(&request.params, "episode")?;
            let selector = request
                .params
                .get("selector")
                .or_else(|| request.params.get("clip"))
                .or_else(|| request.params.get("tab"))
                .and_then(Value::as_str)
                .unwrap_or("body")
                .to_string();
            let window = optional_string(&request.params, "window");
            let (window_id, webview) =
                manager.webview_for_target(&project, &episode, window.as_deref())?;
            let script = click_script(&selector);
            webview
                .evaluate_script_with_callback(
                    &script,
                    callback_for_shared(request.req_id.clone(), Arc::clone(&shared_ack)),
                )
                .map_err(|err| format!("click evaluate failed: {err}"))?;
            Ok(json!({ "window_id": window_id }))
        })();

        if let Err(error) = result {
            send_shared_error(&shared_ack, request.req_id, error);
        }
    }

    pub fn screenshot(
        manager: &WindowManager,
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    ) {
        let shared_ack = shared_ack(ack);
        let result = (|| {
            let project = required_string(&request.params, "project")?;
            let episode = required_string(&request.params, "episode")?;
            let region = request
                .params
                .get("region")
                .and_then(Value::as_str)
                .unwrap_or("full")
                .to_string();
            let out = request
                .params
                .get("out")
                .and_then(Value::as_str)
                .unwrap_or("-")
                .to_string();
            let window = optional_string(&request.params, "window");
            let (window_id, webview) =
                manager.webview_for_target(&project, &episode, window.as_deref())?;
            let script = screenshot_probe_script(&region);
            let req_id = request.req_id.clone();
            let window_id = window_id.to_string();
            let response_window_id = window_id.clone();
            let callback_ack = Arc::clone(&shared_ack);
            webview
                .evaluate_script_with_callback(&script, move |raw| {
                    let response = screenshot_response(&req_id, &window_id, &region, &out, &raw);
                    send_shared_response(&callback_ack, response);
                })
                .map_err(|err| format!("screenshot evaluate failed: {err}"))?;
            Ok(json!({ "window_id": response_window_id }))
        })();

        if let Err(error) = result {
            send_shared_error(&shared_ack, request.req_id, error);
        }
    }

    pub fn capture(manager: &mut WindowManager, request: IpcRequest) -> IpcResponse {
        let result = (|| {
            let project = required_string(&request.params, "project")?;
            let episode = required_string(&request.params, "episode")?;
            let out = required_string(&request.params, "out")?;
            let window = optional_string(&request.params, "window_id")
                .or_else(|| optional_string(&request.params, "window"));
            let (window_id, window_number) =
                manager.native_window_number_for_target(&project, &episode, window.as_deref())?;
            manager.focus(&window_id)?;
            std::thread::sleep(std::time::Duration::from_millis(120));
            let capture = crate::capture::capture_window_by_number(window_number, Path::new(&out))?;
            Ok(json!({
                "out": capture.out.display().to_string(),
                "bytes": capture.bytes,
                "width": capture.width,
                "height": capture.height,
                "window_id": window_id,
                "window_number": window_number
            }))
        })();

        response_from_result(request.req_id, result)
    }

    pub fn devtools_query(
        manager: &WindowManager,
        request: IpcRequest,
        ack: oneshot::Sender<IpcResponse>,
    ) {
        let shared_ack = shared_ack(ack);
        let req_id = request.req_id.clone();
        let result = (|| {
            let project = required_string(&request.params, "project")?;
            let episode = required_string(&request.params, "episode")?;
            let query = required_string(&request.params, "query")?;
            let get = request
                .params
                .get("get")
                .and_then(Value::as_str)
                .unwrap_or("outerHTML")
                .to_string();
            let action = optional_string(&request.params, "action");
            let value = optional_string(&request.params, "value");
            let window = optional_string(&request.params, "window");
            let (_, webview) = manager.webview_for_target(&project, &episode, window.as_deref())?;
            let script = devtools_script(&query, &get, action.as_deref(), value.as_deref());
            webview
                .evaluate_script_with_callback(
                    &script,
                    callback_for_shared(req_id.clone(), Arc::clone(&shared_ack)),
                )
                .map_err(|err| format!("devtools evaluate failed: {err}"))?;
            Ok(())
        })();

        if let Err(error) = result {
            send_shared_error(&shared_ack, request.req_id, error);
        }
    }
}

fn required_string(params: &Value, key: &str) -> Result<String, String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| format!("missing required parameter: {key}"))
}

fn optional_string(params: &Value, key: &str) -> Option<String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn response_from_result(req_id: String, result: Result<Value, String>) -> IpcResponse {
    match result {
        Ok(data) => IpcResponse {
            req_id,
            ok: true,
            data: Some(data),
            error: None,
        },
        Err(error) => error_response(req_id, error),
    }
}

fn error_response(req_id: String, error: String) -> IpcResponse {
    IpcResponse {
        req_id,
        ok: false,
        data: None,
        error: Some(json!(NfError::ValidationFailed(error).to_record())),
    }
}

type SharedAck = Arc<Mutex<Option<oneshot::Sender<IpcResponse>>>>;

fn shared_ack(ack: oneshot::Sender<IpcResponse>) -> SharedAck {
    Arc::new(Mutex::new(Some(ack)))
}

fn send_shared_response(shared_ack: &SharedAck, response: IpcResponse) {
    let Ok(mut guard) = shared_ack.lock() else {
        return;
    };
    if let Some(ack) = guard.take() {
        let _send_result = ack.send(response);
    }
}

fn send_shared_error(shared_ack: &SharedAck, req_id: String, error: String) {
    send_shared_response(shared_ack, error_response(req_id, error));
}

fn callback_for_shared(req_id: String, shared_ack: SharedAck) -> impl Fn(String) + Send + 'static {
    move |raw| {
        let response = js_callback_response(&req_id, &raw);
        send_shared_response(&shared_ack, response);
    }
}

fn js_callback_response(req_id: &str, raw: &str) -> IpcResponse {
    match serde_json::from_str::<Value>(raw) {
        Ok(value) if value.get("ok").and_then(Value::as_bool) == Some(false) => IpcResponse {
            req_id: req_id.to_string(),
            ok: false,
            data: None,
            error: Some(json!(NfError::ValidationFailed(
                value
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("JavaScript operation failed")
                    .to_string()
            )
            .to_record())),
        },
        Ok(value) => IpcResponse {
            req_id: req_id.to_string(),
            ok: true,
            data: Some(value),
            error: None,
        },
        Err(err) => IpcResponse {
            req_id: req_id.to_string(),
            ok: false,
            data: None,
            error: Some(json!(NfError::ValidationFailed(format!(
                "invalid JavaScript callback JSON: {err}; raw={raw}"
            ))
            .to_record())),
        },
    }
}

fn click_script(selector: &str) -> String {
    let selector_json = json_string(selector);
    format!(
        r#"(function() {{
  const selector = {selector_json};
  const el = document.querySelector(selector);
  if (!el) return {{ ok: false, error: "selector not found: " + selector }};
  const rect = el.getBoundingClientRect();
  const eventInit = {{ bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }};
  el.dispatchEvent(new MouseEvent("mousedown", eventInit));
  el.dispatchEvent(new MouseEvent("mouseup", eventInit));
  el.dispatchEvent(new MouseEvent("click", eventInit));
  return {{ ok: true, selector, rect: {{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }} }};
}})()"#
    )
}

fn devtools_script(query: &str, get: &str, action: Option<&str>, value: Option<&str>) -> String {
    let query_json = json_string(query);
    let get_json = json_string(get);
    let action_json = json_string(action.unwrap_or(""));
    let value_json = json_string(value.unwrap_or(""));
    format!(
        r#"(function() {{
  const selector = {query_json};
  const get = {get_json};
  const action = {action_json};
  const actionValue = {value_json};
  const el = document.querySelector(selector);
  if (!el) return {{ ok: false, error: "selector not found: " + selector }};
  if (action === "append-style") {{
    const style = document.createElement("style");
    style.setAttribute("data-nextframe-devtools", "true");
    style.textContent = actionValue;
    document.head.appendChild(style);
  }} else if (action === "remove") {{
    el.remove();
  }} else if (action === "set-css-var") {{
    const parts = actionValue.split("=");
    if (parts.length >= 2) document.documentElement.style.setProperty(parts[0].trim(), parts.slice(1).join("=").trim());
  }}
  let result;
  if (get.startsWith("computed-style:")) {{
    const prop = get.slice("computed-style:".length);
    const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const styles = getComputedStyle(el);
    result = styles.getPropertyValue(prop) || styles[camel] || "";
  }} else if (get === "outerHTML") {{
    result = el.outerHTML;
  }} else {{
    result = el[get];
  }}
  return {{ ok: true, selector, get, value: result }};
}})()"#
    )
}

fn screenshot_probe_script(region: &str) -> String {
    let selector = match region {
        "topbar" => ".topbar",
        "clips" => ".clips, nf-clips",
        "log" => ".log, nf-log",
        "timeline" => ".timeline, nf-timeline",
        "inspector" => ".inspector, nf-inspector",
        "preview" => ".preview",
        _ => "",
    };
    let selector_json = json_string(selector);
    format!(
        r#"(function() {{
  const selector = {selector_json};
  const el = selector ? document.querySelector(selector) : document.documentElement;
  const target = el || document.documentElement;
  const rect = target.getBoundingClientRect();
  const width = Math.max(1, Math.round((selector && el ? rect.width : window.innerWidth) || 1));
  const height = Math.max(1, Math.round((selector && el ? rect.height : window.innerHeight) || 1));
  return {{ ok: true, width, height, dpr: 1, selector, found: !!el, outerHTML: document.documentElement.outerHTML }};
}})()"#
    )
}

fn screenshot_response(
    req_id: &str,
    window_id: &str,
    region: &str,
    out: &str,
    raw: &str,
) -> IpcResponse {
    let value = match serde_json::from_str::<Value>(raw) {
        Ok(value) => value,
        Err(err) => {
            return error_response(
                req_id.to_string(),
                format!("invalid screenshot probe JSON: {err}; raw={raw}"),
            );
        }
    };
    let width = value
        .get("width")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(1)
        .clamp(1, 4096);
    let height = value
        .get("height")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(1)
        .clamp(1, 4096);
    let png = encode_stub_png(width, height);
    let output = if out == "-" {
        None
    } else {
        Some(PathBuf::from(out))
    };

    if let Some(path) = output.as_ref() {
        if let Err(err) = write_png(path, &png) {
            return error_response(
                req_id.to_string(),
                format!("write screenshot failed: {err}"),
            );
        }
    }

    IpcResponse {
        req_id: req_id.to_string(),
        ok: true,
        data: Some(json!({
            "window_id": window_id,
            "region": region,
            "out": output.as_ref().map(|path| path.display().to_string()),
            "width": width,
            "height": height,
            "bytes": png.len(),
            "format": "png",
            "probe": value
        })),
        error: None,
    }
}

fn write_png(path: &Path, png: &[u8]) -> Result<(), std::io::Error> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, png)
}

pub fn encode_stub_png(width: u32, height: u32) -> Vec<u8> {
    let row_len = 1usize + width as usize * 4;
    let mut raw = Vec::with_capacity(row_len * height as usize);
    for y in 0..height {
        raw.push(0);
        for x in 0..width {
            let shade = 18u8.saturating_add(((x + y) % 18) as u8);
            raw.extend_from_slice(&[shade, shade, 28, 255]);
        }
    }

    let mut png = Vec::new();
    png.extend_from_slice(b"\x89PNG\r\n\x1a\n");

    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    push_chunk(&mut png, b"IHDR", &ihdr);

    let compressed = zlib_store(&raw);
    push_chunk(&mut png, b"IDAT", &compressed);
    push_chunk(&mut png, b"IEND", &[]);
    png
}

fn zlib_store(data: &[u8]) -> Vec<u8> {
    let mut out = vec![0x78, 0x01];
    let mut offset = 0usize;
    while offset < data.len() {
        let remaining = data.len() - offset;
        let block_len = remaining.min(65_535);
        let final_block = offset + block_len == data.len();
        out.push(if final_block { 0x01 } else { 0x00 });
        let len = block_len as u16;
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(&(!len).to_le_bytes());
        out.extend_from_slice(&data[offset..offset + block_len]);
        offset += block_len;
    }
    out.extend_from_slice(&adler32(data).to_be_bytes());
    out
}

fn push_chunk(png: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    png.extend_from_slice(&(data.len() as u32).to_be_bytes());
    png.extend_from_slice(kind);
    png.extend_from_slice(data);
    let mut crc_input = Vec::with_capacity(kind.len() + data.len());
    crc_input.extend_from_slice(kind);
    crc_input.extend_from_slice(data);
    png.extend_from_slice(&crc32(&crc_input).to_be_bytes());
}

fn adler32(data: &[u8]) -> u32 {
    const MOD: u32 = 65_521;
    let mut a = 1u32;
    let mut b = 0u32;
    for byte in data {
        a = (a + u32::from(*byte)) % MOD;
        b = (b + a) % MOD;
    }
    (b << 16) | a
}

fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = 0u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

fn json_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

#[cfg(test)]
mod tests {
    use super::{encode_stub_png, js_callback_response};

    #[test]
    fn screenshot_png_has_valid_signature() {
        let png = encode_stub_png(2, 2);

        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(png.windows(4).any(|chunk| chunk == b"IHDR"));
        assert!(png.windows(4).any(|chunk| chunk == b"IDAT"));
        assert!(png.windows(4).any(|chunk| chunk == b"IEND"));
    }

    #[test]
    fn javascript_error_callback_maps_to_ipc_error() -> Result<(), Box<dyn std::error::Error>> {
        let response = js_callback_response("r-1", r#"{"ok":false,"error":"missing"}"#);

        assert!(!response.ok);
        let error = response
            .error
            .ok_or_else(|| std::io::Error::other("missing error record"))?;
        assert_eq!(error["error"], "validation failed");
        assert_eq!(
            error["detail"],
            "missing · see `nf <cmd> --help` for expected format"
        );
        Ok(())
    }
}
