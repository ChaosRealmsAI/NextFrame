use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use interprocess::local_socket::tokio::prelude::*;
use interprocess::local_socket::{GenericFilePath, ToFsName};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::errors::NfError;

const IPC_TIMEOUT: Duration = Duration::from_secs(10);
static REQ_COUNTER: AtomicU64 = AtomicU64::new(1);

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

pub fn request(op: impl Into<String>, params: Value) -> IpcRequest {
    let seq = REQ_COUNTER.fetch_add(1, Ordering::Relaxed);
    IpcRequest {
        req_id: format!("{}-{seq}", std::process::id()),
        op: op.into(),
        params,
    }
}

pub fn send(req: IpcRequest) -> Result<IpcResponse, NfError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;

    runtime
        .block_on(async { tokio::time::timeout(IPC_TIMEOUT, send_async(req)).await })
        .map_err(|_| NfError::SocketFailed("IPC request timed out after 10s".to_string()))?
}

async fn send_async(req: IpcRequest) -> Result<IpcResponse, NfError> {
    let path = socket_path();
    let name = path
        .to_str()
        .ok_or_else(|| NfError::SocketFailed(format!("socket path is not UTF-8: {path:?}")))?
        .to_fs_name::<GenericFilePath>()
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;

    let conn = interprocess::local_socket::tokio::Stream::connect(name)
        .await
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    let (read_half, mut write_half) = conn.split();
    let mut payload = serde_json::to_string(&req)?;
    payload.push('\n');

    write_half
        .write_all(payload.as_bytes())
        .await
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    write_half
        .flush()
        .await
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;

    let mut reader = BufReader::new(read_half);
    let mut line = String::new();
    let bytes = reader
        .read_line(&mut line)
        .await
        .map_err(|err| NfError::SocketFailed(err.to_string()))?;
    if bytes == 0 {
        return Err(NfError::SocketFailed(
            "IPC server closed before sending a response".to_string(),
        ));
    }

    let resp: IpcResponse = serde_json::from_str(line.trim_end())?;
    if resp.req_id != req.req_id {
        return Err(NfError::SocketFailed(format!(
            "IPC req_id mismatch: sent {}, received {}",
            req.req_id, resp.req_id
        )));
    }

    Ok(resp)
}

fn get_uid() -> u32 {
    unsafe extern "C" {
        fn getuid() -> u32;
    }

    unsafe { getuid() }
}
