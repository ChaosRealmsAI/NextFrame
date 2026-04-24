// POC P-02 · tao 多窗 + Unix socket IPC 双向
//
// 架构:
//   - main thread:  tao EventLoop (macOS required)
//                   EventLoopProxy 用来从 IPC 线程 inject user events
//   - tokio thread: Unix socket server (NDJSON · req/resp with req_id)
//   - ctrlc:        SIGINT/SIGTERM → 清 sock → exit
//
// 自验证 CLI (走 stdout JSON line · 测试脚本用):
//   --headless        不开 GUI (跑 IPC-only 测试用)
//   --initial-windows N  启动就开 N 个 window
//   --no-auto-quit    关最后一窗不退(Mac 默认行为但显式保证)
//
// IPC ops:
//   { "op": "ping", "req_id": N }                    → { req_id, ok:true, data:"pong" }
//   { "op": "list-windows", "req_id": N }            → { req_id, ok:true, data:[window_ids] }
//   { "op": "open-window", "req_id": N, "id": "..." } → { req_id, ok:true, data:{created:id} }
//   { "op": "close-window", "req_id": N, "id": "..."} → { req_id, ok:true }
//   { "op": "quit", "req_id": N }                    → { req_id, ok:true } 然后 EventLoop 退出

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tao::event::{Event, StartCause, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop, EventLoopBuilder, EventLoopProxy};
use tao::window::{Window, WindowBuilder, WindowId};

use interprocess::local_socket::tokio::prelude::*;
use interprocess::local_socket::{GenericFilePath, ListenerOptions, ToFsName};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Debug, Clone, Deserialize)]
struct IpcReq {
    op: String,
    req_id: u64,
    #[serde(default)]
    id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct IpcResp {
    req_id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// User events injected from IPC thread into tao EventLoop.
#[derive(Debug)]
enum UserEvent {
    OpenWindow {
        id: String,
        ack: tokio::sync::oneshot::Sender<Result<String, String>>,
    },
    CloseWindow {
        id: String,
        ack: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
    ListWindows {
        ack: tokio::sync::oneshot::Sender<Vec<String>>,
    },
    Quit {
        ack: tokio::sync::oneshot::Sender<()>,
    },
}

/// Shared between IPC thread and main. Tracks socket path for Drop.
struct SocketGuard {
    path: PathBuf,
}
impl Drop for SocketGuard {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = std::fs::remove_file(&self.path);
            eprintln!("[guard] socket cleaned: {}", self.path.display());
        }
    }
}

fn socket_path() -> PathBuf {
    let uid = libc_getuid();
    PathBuf::from(format!("/tmp/nf-test-{}.sock", uid))
}

extern "C" {
    fn getuid() -> u32;
}
fn libc_getuid() -> u32 {
    unsafe { getuid() }
}

fn main() {
    // Parse args
    let args: Vec<String> = std::env::args().collect();
    let headless = args.iter().any(|a| a == "--headless");
    let initial_windows: usize = args
        .iter()
        .position(|a| a == "--initial-windows")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let sock = socket_path();
    // Clean stale socket from crashed prior run
    if sock.exists() {
        let _ = std::fs::remove_file(&sock);
        eprintln!("[init] removed stale socket: {}", sock.display());
    }
    let _guard = Arc::new(SocketGuard { path: sock.clone() });

    // Install ctrlc handler (SIGINT + SIGTERM)
    {
        let sock_for_sig = sock.clone();
        ctrlc::set_handler(move || {
            eprintln!("[sig] caught signal · cleaning socket");
            if sock_for_sig.exists() {
                let _ = std::fs::remove_file(&sock_for_sig);
            }
            std::process::exit(0);
        })
        .expect("install signal handler");
    }

    if headless {
        run_headless(sock, initial_windows);
    } else {
        run_with_gui(sock, initial_windows);
    }
}

/// Headless mode: no tao EventLoop. Just IPC server. For testing socket/IPC parts only.
fn run_headless(sock: PathBuf, _initial_windows: usize) {
    eprintln!("[main] headless mode · sock={}", sock.display());
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");

    // Simple state: just a window list (simulated)
    let windows: Arc<Mutex<HashMap<String, ()>>> = Arc::new(Mutex::new(HashMap::new()));
    let counter = Arc::new(AtomicU64::new(0));

    rt.block_on(async {
        let printname = sock
            .to_str()
            .expect("sock utf8")
            .to_fs_name::<GenericFilePath>()
            .expect("fs name");
        let opts = ListenerOptions::new().name(printname);
        let listener = opts.create_tokio().expect("bind listener");
        eprintln!("[ipc] listening {}", sock.display());
        // Ready signal for tests that poll
        println!("{{\"event\":\"ready\",\"sock\":\"{}\"}}", sock.display());

        loop {
            let conn = match listener.accept().await {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[ipc] accept err: {e}");
                    continue;
                }
            };
            let windows = windows.clone();
            let counter = counter.clone();
            tokio::spawn(async move {
                handle_conn_headless(conn, windows, counter).await;
            });
        }
    });
}

async fn handle_conn_headless(
    conn: interprocess::local_socket::tokio::Stream,
    windows: Arc<Mutex<HashMap<String, ()>>>,
    counter: Arc<AtomicU64>,
) {
    let (read_half, mut write_half) = conn.split();
    let mut reader = BufReader::new(read_half);
    let mut line = String::new();
    loop {
        line.clear();
        let n = match reader.read_line(&mut line).await {
            Ok(0) => return,
            Ok(n) => n,
            Err(e) => {
                eprintln!("[ipc] read err: {e}");
                return;
            }
        };
        let _ = n;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let req: IpcReq = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(e) => {
                let resp = IpcResp {
                    req_id: 0,
                    ok: false,
                    data: None,
                    error: Some(format!("parse: {e}")),
                };
                let mut s = serde_json::to_string(&resp).unwrap_or_default();
                s.push('\n');
                let _ = write_half.write_all(s.as_bytes()).await;
                continue;
            }
        };
        counter.fetch_add(1, Ordering::SeqCst);

        let resp = match req.op.as_str() {
            "ping" => IpcResp {
                req_id: req.req_id,
                ok: true,
                data: Some(serde_json::json!("pong")),
                error: None,
            },
            "list-windows" => {
                let ids: Vec<String> = windows.lock().unwrap().keys().cloned().collect();
                IpcResp {
                    req_id: req.req_id,
                    ok: true,
                    data: Some(serde_json::json!(ids)),
                    error: None,
                }
            }
            "open-window" => {
                let id = req
                    .id
                    .clone()
                    .unwrap_or_else(|| format!("w-{}", counter.load(Ordering::SeqCst)));
                windows.lock().unwrap().insert(id.clone(), ());
                IpcResp {
                    req_id: req.req_id,
                    ok: true,
                    data: Some(serde_json::json!({ "created": id })),
                    error: None,
                }
            }
            "close-window" => {
                let id = req.id.clone().unwrap_or_default();
                let removed = windows.lock().unwrap().remove(&id).is_some();
                if removed {
                    IpcResp {
                        req_id: req.req_id,
                        ok: true,
                        data: None,
                        error: None,
                    }
                } else {
                    IpcResp {
                        req_id: req.req_id,
                        ok: false,
                        data: None,
                        error: Some(format!("no such window: {id}")),
                    }
                }
            }
            "quit" => {
                let resp = IpcResp {
                    req_id: req.req_id,
                    ok: true,
                    data: None,
                    error: None,
                };
                let mut s = serde_json::to_string(&resp).unwrap_or_default();
                s.push('\n');
                let _ = write_half.write_all(s.as_bytes()).await;
                let _ = write_half.shutdown().await;
                eprintln!("[ipc] quit requested");
                std::process::exit(0);
            }
            other => IpcResp {
                req_id: req.req_id,
                ok: false,
                data: None,
                error: Some(format!("unknown op: {other}")),
            },
        };

        let mut s = serde_json::to_string(&resp).unwrap_or_default();
        s.push('\n');
        if let Err(e) = write_half.write_all(s.as_bytes()).await {
            eprintln!("[ipc] write err: {e}");
            return;
        }
    }
}

/// With tao EventLoop. Windows are real tao::Window.
fn run_with_gui(sock: PathBuf, initial_windows: usize) {
    eprintln!("[main] gui mode · sock={}", sock.display());
    let event_loop: EventLoop<UserEvent> = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    // Spawn tokio runtime for IPC in background thread.
    let sock_clone = sock.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio rt");
        rt.block_on(ipc_server_gui(sock_clone, proxy));
    });

    // Window state on main thread
    let mut windows: HashMap<String, Window> = HashMap::new();
    let mut id_by_winid: HashMap<WindowId, String> = HashMap::new();

    // Pre-create initial windows
    for i in 0..initial_windows {
        let id = format!("w-{}", i + 1);
        match WindowBuilder::new()
            .with_title(&format!("POC P-02 · {}", id))
            .with_inner_size(tao::dpi::LogicalSize::new(480.0, 320.0))
            .build(&event_loop)
        {
            Ok(w) => {
                id_by_winid.insert(w.id(), id.clone());
                windows.insert(id, w);
            }
            Err(e) => eprintln!("[main] pre-build window err: {e}"),
        }
    }
    eprintln!("[main] initial windows: {}", windows.len());
    println!(
        "{{\"event\":\"ready\",\"sock\":\"{}\",\"windows\":{}}}",
        sock.display(),
        windows.len()
    );

    event_loop.run(move |event, target, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => {
                eprintln!("[evloop] init");
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                window_id,
                ..
            } => {
                if let Some(id) = id_by_winid.remove(&window_id) {
                    windows.remove(&id);
                    eprintln!(
                        "[evloop] window closed: {} (remaining: {})",
                        id,
                        windows.len()
                    );
                }
                // Mac convention: closing last window does NOT quit the app.
                // We explicitly keep event loop alive.
            }
            Event::UserEvent(ev) => match ev {
                UserEvent::OpenWindow { id, ack } => {
                    if windows.contains_key(&id) {
                        let _ = ack.send(Err(format!("already exists: {id}")));
                    } else {
                        match WindowBuilder::new()
                            .with_title(&format!("POC P-02 · {}", id))
                            .with_inner_size(tao::dpi::LogicalSize::new(480.0, 320.0))
                            .build(target)
                        {
                            Ok(w) => {
                                id_by_winid.insert(w.id(), id.clone());
                                windows.insert(id.clone(), w);
                                eprintln!(
                                    "[evloop] opened: {} (total: {})",
                                    id,
                                    windows.len()
                                );
                                let _ = ack.send(Ok(id));
                            }
                            Err(e) => {
                                let _ = ack.send(Err(format!("build: {e}")));
                            }
                        }
                    }
                }
                UserEvent::CloseWindow { id, ack } => {
                    if let Some(w) = windows.remove(&id) {
                        id_by_winid.remove(&w.id());
                        drop(w); // Window dropped → OS close
                        eprintln!("[evloop] closed via ipc: {}", id);
                        let _ = ack.send(Ok(()));
                    } else {
                        let _ = ack.send(Err(format!("no such window: {id}")));
                    }
                }
                UserEvent::ListWindows { ack } => {
                    let ids: Vec<String> = windows.keys().cloned().collect();
                    let _ = ack.send(ids);
                }
                UserEvent::Quit { ack } => {
                    let _ = ack.send(());
                    eprintln!("[evloop] quit requested");
                    *control_flow = ControlFlow::Exit;
                }
            },
            _ => {}
        }
    });
}

async fn ipc_server_gui(sock: PathBuf, proxy: EventLoopProxy<UserEvent>) {
    let counter = Arc::new(AtomicU64::new(0));
    let printname = match sock.to_str().expect("utf8").to_fs_name::<GenericFilePath>() {
        Ok(n) => n,
        Err(e) => {
            eprintln!("[ipc] fsname err: {e}");
            return;
        }
    };
    let opts = ListenerOptions::new().name(printname);
    let listener = match opts.create_tokio() {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[ipc] bind err: {e}");
            return;
        }
    };
    eprintln!("[ipc] listening {}", sock.display());

    loop {
        let conn = match listener.accept().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[ipc] accept err: {e}");
                tokio::time::sleep(Duration::from_millis(50)).await;
                continue;
            }
        };
        let proxy = proxy.clone();
        let counter = counter.clone();
        tokio::spawn(async move {
            handle_conn_gui(conn, proxy, counter).await;
        });
    }
}

async fn handle_conn_gui(
    conn: interprocess::local_socket::tokio::Stream,
    proxy: EventLoopProxy<UserEvent>,
    counter: Arc<AtomicU64>,
) {
    let (read_half, mut write_half) = conn.split();
    let mut reader = BufReader::new(read_half);
    let mut line = String::new();
    loop {
        line.clear();
        let n = match reader.read_line(&mut line).await {
            Ok(0) => return,
            Ok(n) => n,
            Err(e) => {
                eprintln!("[ipc] read err: {e}");
                return;
            }
        };
        let _ = n;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let req: IpcReq = match serde_json::from_str(trimmed) {
            Ok(r) => r,
            Err(e) => {
                let resp = IpcResp {
                    req_id: 0,
                    ok: false,
                    data: None,
                    error: Some(format!("parse: {e}")),
                };
                let mut s = serde_json::to_string(&resp).unwrap_or_default();
                s.push('\n');
                let _ = write_half.write_all(s.as_bytes()).await;
                continue;
            }
        };
        counter.fetch_add(1, Ordering::SeqCst);

        let resp = dispatch_gui(&req, &proxy, &counter).await;
        let mut s = serde_json::to_string(&resp).unwrap_or_default();
        s.push('\n');
        if let Err(e) = write_half.write_all(s.as_bytes()).await {
            eprintln!("[ipc] write err: {e}");
            return;
        }
    }
}

async fn dispatch_gui(
    req: &IpcReq,
    proxy: &EventLoopProxy<UserEvent>,
    counter: &AtomicU64,
) -> IpcResp {
    match req.op.as_str() {
        "ping" => IpcResp {
            req_id: req.req_id,
            ok: true,
            data: Some(serde_json::json!("pong")),
            error: None,
        },
        "list-windows" => {
            let (tx, rx) = tokio::sync::oneshot::channel();
            if let Err(e) = proxy.send_event(UserEvent::ListWindows { ack: tx }) {
                return IpcResp {
                    req_id: req.req_id,
                    ok: false,
                    data: None,
                    error: Some(format!("proxy: {e}")),
                };
            }
            match tokio::time::timeout(Duration::from_millis(500), rx).await {
                Ok(Ok(ids)) => IpcResp {
                    req_id: req.req_id,
                    ok: true,
                    data: Some(serde_json::json!(ids)),
                    error: None,
                },
                _ => IpcResp {
                    req_id: req.req_id,
                    ok: false,
                    data: None,
                    error: Some("timeout".into()),
                },
            }
        }
        "open-window" => {
            let id = req
                .id
                .clone()
                .unwrap_or_else(|| format!("w-{}", counter.load(Ordering::SeqCst)));
            let (tx, rx) = tokio::sync::oneshot::channel();
            if let Err(e) = proxy.send_event(UserEvent::OpenWindow {
                id: id.clone(),
                ack: tx,
            }) {
                return IpcResp {
                    req_id: req.req_id,
                    ok: false,
                    data: None,
                    error: Some(format!("proxy: {e}")),
                };
            }
            match tokio::time::timeout(Duration::from_millis(1000), rx).await {
                Ok(Ok(Ok(created))) => IpcResp {
                    req_id: req.req_id,
                    ok: true,
                    data: Some(serde_json::json!({ "created": created })),
                    error: None,
                },
                Ok(Ok(Err(e))) => IpcResp {
                    req_id: req.req_id,
                    ok: false,
                    data: None,
                    error: Some(e),
                },
                _ => IpcResp {
                    req_id: req.req_id,
                    ok: false,
                    data: None,
                    error: Some("timeout".into()),
                },
            }
        }
        "close-window" => {
            let id = req.id.clone().unwrap_or_default();
            let (tx, rx) = tokio::sync::oneshot::channel();
            if let Err(e) = proxy.send_event(UserEvent::CloseWindow {
                id: id.clone(),
                ack: tx,
            }) {
                return IpcResp {
                    req_id: req.req_id,
                    ok: false,
                    data: None,
                    error: Some(format!("proxy: {e}")),
                };
            }
            match tokio::time::timeout(Duration::from_millis(500), rx).await {
                Ok(Ok(Ok(()))) => IpcResp {
                    req_id: req.req_id,
                    ok: true,
                    data: None,
                    error: None,
                },
                Ok(Ok(Err(e))) => IpcResp {
                    req_id: req.req_id,
                    ok: false,
                    data: None,
                    error: Some(e),
                },
                _ => IpcResp {
                    req_id: req.req_id,
                    ok: false,
                    data: None,
                    error: Some("timeout".into()),
                },
            }
        }
        "quit" => {
            let (tx, rx) = tokio::sync::oneshot::channel();
            let _ = proxy.send_event(UserEvent::Quit { ack: tx });
            let _ = tokio::time::timeout(Duration::from_millis(500), rx).await;
            IpcResp {
                req_id: req.req_id,
                ok: true,
                data: None,
                error: None,
            }
        }
        other => IpcResp {
            req_id: req.req_id,
            ok: false,
            data: None,
            error: Some(format!("unknown op: {other}")),
        },
    }
}
