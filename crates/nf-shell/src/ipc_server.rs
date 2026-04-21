use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use interprocess::local_socket::tokio::prelude::*;
use interprocess::local_socket::{GenericFilePath, ListenerOptions, ToFsName};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tao::event_loop::EventLoopProxy;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::oneshot;

use crate::errors::NfError;
use crate::events::UserEvent;
use crate::handlers::ComposeOpHandler;

const EVENT_ACK_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcRequest {
    pub req_id: String,
    pub op: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcResponse {
    pub req_id: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
}

pub trait OpHandler: Send + Sync {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError>;
}

#[derive(Debug, Default)]
pub struct StubHandler;

impl OpHandler for StubHandler {
    fn handle(&self, req: &IpcRequest) -> Result<Option<Value>, NfError> {
        Err(NfError::NotImplemented(format!(
            "{} is not implemented by StubHandler",
            req.op
        )))
    }
}

pub trait SocketCleanup {
    fn cleanup_socket(&self) -> Result<bool, NfError>;
}

#[derive(Debug)]
pub struct SocketGuard {
    path: PathBuf,
}

impl SocketGuard {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl SocketCleanup for SocketGuard {
    fn cleanup_socket(&self) -> Result<bool, NfError> {
        if !self.path.exists() {
            return Ok(false);
        }
        fs::remove_file(&self.path).map_err(|err| NfError::SocketFailed(err.to_string()))?;
        Ok(true)
    }
}

impl Drop for SocketGuard {
    fn drop(&mut self) {
        let _cleanup_result = self.cleanup_socket();
    }
}

pub fn socket_path() -> PathBuf {
    let uid = get_uid();
    if cfg!(target_os = "macos") {
        return PathBuf::from(format!("/tmp/nextframe-{uid}.sock"));
    }

    std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(format!("nextframe-{uid}.sock"))
}

pub fn install_ctrlc_cleanup(path: PathBuf) -> Result<(), NfError> {
    ctrlc::set_handler(move || {
        if path.exists() {
            let _remove_result = fs::remove_file(&path);
        }
        std::process::exit(0);
    })
    .map_err(|err| NfError::SocketFailed(err.to_string()))
}

pub fn spawn_server_thread(
    proxy: EventLoopProxy<UserEvent>,
    handler: Arc<dyn OpHandler>,
) -> Result<std::thread::JoinHandle<()>, NfError> {
    let path = socket_path();
    cleanup_stale_socket(&path)?;
    install_ctrlc_cleanup(path.clone())?;
    let guard = SocketGuard::new(path.clone());

    let handle = std::thread::spawn(move || {
        let runtime = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime,
            Err(err) => {
                eprintln!("nf-shell IPC runtime failed: {err}");
                return;
            }
        };
        let _guard = guard;
        if let Err(err) = runtime.block_on(serve_with_event_loop(path, proxy, handler)) {
            eprintln!("nf-shell IPC server failed: {err}");
        }
    });

    Ok(handle)
}

pub async fn serve(path: PathBuf, proxy: EventLoopProxy<UserEvent>) -> Result<(), NfError> {
    let handler = Arc::new(ComposeOpHandler::from_default_storage()?);
    serve_with_event_loop(path, proxy, handler).await
}

pub async fn serve_handler(path: PathBuf, handler: Arc<dyn OpHandler>) -> Result<(), NfError> {
    cleanup_stale_socket(&path)?;
    let name = path
        .to_str()
        .ok_or_else(|| NfError::SocketFailed(format!("socket path is not UTF-8: {path:?}")))?
        .to_fs_name::<GenericFilePath>()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    let listener = ListenerOptions::new()
        .name(name)
        .create_tokio()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;

    loop {
        let conn = listener
            .accept()
            .await
            .map_err(|err| NfError::SocketFailed(err.to_string()))?;
        let handler = handler.clone();
        tokio::spawn(async move {
            let _conn_result = handle_connection_with_handler(conn, handler).await;
        });
    }
}

async fn serve_with_event_loop(
    path: PathBuf,
    proxy: EventLoopProxy<UserEvent>,
    handler: Arc<dyn OpHandler>,
) -> Result<(), NfError> {
    cleanup_stale_socket(&path)?;
    let name = path
        .to_str()
        .ok_or_else(|| NfError::SocketFailed(format!("socket path is not UTF-8: {path:?}")))?
        .to_fs_name::<GenericFilePath>()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    let listener = ListenerOptions::new()
        .name(name)
        .create_tokio()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;

    loop {
        let conn = listener
            .accept()
            .await
            .map_err(|err| NfError::SocketFailed(err.to_string()))?;
        let proxy = proxy.clone();
        let handler = handler.clone();
        tokio::spawn(async move {
            let _conn_result = handle_connection(conn, proxy, handler).await;
        });
    }
}

async fn handle_connection(
    conn: interprocess::local_socket::tokio::Stream,
    proxy: EventLoopProxy<UserEvent>,
    handler: std::sync::Arc<dyn OpHandler>,
) -> Result<(), NfError> {
    let (read_half, mut write_half) = conn.split();
    let mut reader = BufReader::new(read_half);
    let mut line = String::new();

    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .await
            .map_err(|err| NfError::SocketFailed(err.to_string()))?;
        if bytes == 0 {
            return Ok(());
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<IpcRequest>(trimmed) {
            Ok(req) => dispatch(req, &proxy, handler.as_ref()).await,
            Err(err) => IpcResponse {
                req_id: "parse-error".to_string(),
                ok: false,
                data: None,
                error: Some(json!({
                    "error": "validation failed",
                    "detail": format!("invalid NDJSON request: {err}"),
                    "hint": "send one JSON request per line",
                    "exit_code": 2
                })),
            },
        };
        let mut payload = serde_json::to_string(&response)
            .map_err(|err| NfError::SocketFailed(err.to_string()))?;
        payload.push('\n');
        write_half
            .write_all(payload.as_bytes())
            .await
            .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    }
}

async fn handle_connection_with_handler(
    conn: interprocess::local_socket::tokio::Stream,
    handler: std::sync::Arc<dyn OpHandler>,
) -> Result<(), NfError> {
    let (read_half, mut write_half) = conn.split();
    let mut reader = BufReader::new(read_half);
    let mut line = String::new();

    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .await
            .map_err(|err| NfError::SocketFailed(err.to_string()))?;
        if bytes == 0 {
            return Ok(());
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<IpcRequest>(trimmed) {
            Ok(req) => match handler.handle(&req) {
                Ok(Some(data)) => ok_response(&req, data),
                Ok(None) => error_response(
                    &req,
                    &NfError::NotImplemented(format!("unknown op: {}", req.op)),
                ),
                Err(err) => error_response(&req, &err),
            },
            Err(err) => IpcResponse {
                req_id: "parse-error".to_string(),
                ok: false,
                data: None,
                error: Some(json!({
                    "error": "validation failed",
                    "detail": format!("invalid NDJSON request: {err}"),
                    "hint": "send one JSON request per line",
                    "exit_code": 2
                })),
            },
        };
        let mut payload = serde_json::to_string(&response)
            .map_err(|err| NfError::SocketFailed(err.to_string()))?;
        payload.push('\n');
        write_half
            .write_all(payload.as_bytes())
            .await
            .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    }
}

async fn dispatch(
    req: IpcRequest,
    proxy: &EventLoopProxy<UserEvent>,
    handler: &dyn OpHandler,
) -> IpcResponse {
    if is_crud_op(&req.op) {
        return match handler.handle(&req) {
            Ok(Some(data)) => ok_response(&req, data),
            Ok(None) => error_response(
                &req,
                &NfError::ValidationFailed(format!("unknown op: {}", req.op)),
            ),
            Err(err) => error_response(&req, &err),
        };
    }

    match req.op.as_str() {
        "open-window" => {
            send_event(req, proxy, |request, ack| UserEvent::OpenWindow {
                request,
                ack,
            })
            .await
        }
        "close-window" => {
            send_event(req, proxy, |request, ack| UserEvent::CloseWindow {
                request,
                ack,
            })
            .await
        }
        "state-query" => {
            send_event(req, proxy, |request, ack| UserEvent::StateQuery {
                request,
                ack,
            })
            .await
        }
        "click-sim" => {
            send_event(req, proxy, |request, ack| UserEvent::ClickSim {
                request,
                ack,
            })
            .await
        }
        "screenshot" => {
            send_event(req, proxy, |request, ack| UserEvent::Screenshot {
                request,
                ack,
            })
            .await
        }
        "capture" => {
            send_event(req, proxy, |request, ack| UserEvent::CaptureWindow {
                request,
                ack,
            })
            .await
        }
        "devtools-query" => {
            send_event(req, proxy, |request, ack| UserEvent::DevtoolsQuery {
                request,
                ack,
            })
            .await
        }
        "quit" => send_event(req, proxy, |request, ack| UserEvent::Quit { request, ack }).await,
        _ => IpcResponse {
            req_id: req.req_id,
            ok: false,
            data: None,
            error: Some(json!(NfError::ValidationFailed(format!(
                "unknown op: {}",
                req.op
            ))
            .to_record())),
        },
    }
}

fn is_crud_op(op: &str) -> bool {
    let Some((prefix, _rest)) = op.split_once('-').or_else(|| op.split_once('.')) else {
        return false;
    };
    matches!(
        prefix,
        "projects" | "episodes" | "clips" | "anchors" | "log"
    )
}

async fn send_event(
    req: IpcRequest,
    proxy: &EventLoopProxy<UserEvent>,
    build: impl FnOnce(IpcRequest, oneshot::Sender<IpcResponse>) -> UserEvent,
) -> IpcResponse {
    let req_id = req.req_id.clone();
    let (tx, rx) = oneshot::channel();
    if let Err(err) = proxy.send_event(build(req, tx)) {
        return IpcResponse {
            req_id,
            ok: false,
            data: None,
            error: Some(json!({
                "error": "socket failed",
                "detail": format!("event loop proxy failed: {err}"),
                "hint": "restart nf-shell",
                "exit_code": 1
            })),
        };
    }

    match tokio::time::timeout(EVENT_ACK_TIMEOUT, rx).await {
        Ok(Ok(resp)) => resp,
        Ok(Err(err)) => IpcResponse {
            req_id,
            ok: false,
            data: None,
            error: Some(json!({
                "error": "socket failed",
                "detail": format!("event ack dropped: {err}"),
                "hint": "restart nf-shell",
                "exit_code": 1
            })),
        },
        Err(_) => IpcResponse {
            req_id,
            ok: false,
            data: None,
            error: Some(json!({
                "error": "socket failed",
                "detail": "event ack timed out after 10s",
                "hint": "restart nf-shell",
                "exit_code": 1
            })),
        },
    }
}

pub fn not_implemented_response(req: &IpcRequest) -> IpcResponse {
    IpcResponse {
        req_id: req.req_id.clone(),
        ok: false,
        data: None,
        error: Some(json!({
            "error": "not implemented",
            "detail": format!("{} is reserved for W-3 implementation", req.op),
            "hint": "this operation lands in W-3",
            "exit_code": 2
        })),
    }
}

pub fn ok_response(req: &IpcRequest, data: Value) -> IpcResponse {
    IpcResponse {
        req_id: req.req_id.clone(),
        ok: true,
        data: Some(data),
        error: None,
    }
}

pub fn error_response(req: &IpcRequest, err: &NfError) -> IpcResponse {
    IpcResponse {
        req_id: req.req_id.clone(),
        ok: false,
        data: None,
        error: Some(json!(err.to_record())),
    }
}

pub fn cleanup_stale_socket(path: &Path) -> Result<bool, NfError> {
    SocketGuard::new(path.to_path_buf()).cleanup_socket()
}

fn get_uid() -> u32 {
    unsafe extern "C" {
        fn getuid() -> u32;
    }

    unsafe { getuid() }
}

#[allow(dead_code)]
fn ready_response(req: &IpcRequest) -> IpcResponse {
    ok_response(req, json!({ "ready": true }))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{SocketCleanup, SocketGuard};

    #[test]
    fn socket_guard_cleanup_removes_existing_file() -> Result<(), Box<dyn std::error::Error>> {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let path = std::env::temp_dir().join(format!(
            "nextframe-socket-cleanup-{}-{nanos}.sock",
            std::process::id()
        ));
        fs::write(&path, b"stale")?;

        let guard = SocketGuard::new(path.clone());
        let removed = guard.cleanup_socket()?;

        assert!(removed);
        assert!(!path.exists());
        Ok(())
    }
}
