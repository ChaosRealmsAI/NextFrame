use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    sync::mpsc,
    thread,
    time::Instant,
};

use interprocess::local_socket::{
    prelude::*, GenericFilePath, ListenerOptions, Stream as LocalSocketStream, ToFsName,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tao::{
    dpi::{LogicalPosition, LogicalSize},
    event::{Event, StartCause, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy, EventLoopWindowTarget},
    window::{Window, WindowBuilder, WindowId},
};

#[derive(Debug)]
enum UserEvent {
    Request(IpcRequest, mpsc::Sender<IpcResponse>),
    Terminate(&'static str),
}

#[derive(Debug, Deserialize)]
struct IpcRequest {
    req_id: Value,
    op: String,
    window_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct IpcResponse {
    req_id: Value,
    ok: bool,
    data: Value,
    error: Option<String>,
}

struct AppState {
    windows: HashMap<String, Window>,
    by_native_id: HashMap<WindowId, String>,
    next_window: usize,
}

impl AppState {
    fn new() -> Self {
        Self {
            windows: HashMap::new(),
            by_native_id: HashMap::new(),
            next_window: 1,
        }
    }

    fn open_window(
        &mut self,
        event_loop: &EventLoopWindowTarget<UserEvent>,
    ) -> Result<String, String> {
        let window_id = format!("w-{}", self.next_window);
        self.next_window += 1;

        let offset = ((self.next_window - 2) as f64) * 34.0;
        let window = WindowBuilder::new()
            .with_title(format!("NextFrame P-02 about:blank {}", window_id))
            .with_inner_size(LogicalSize::new(560.0, 360.0))
            .with_position(LogicalPosition::new(80.0 + offset, 90.0 + offset))
            .build(event_loop)
            .map_err(|err| format!("failed to create tao window {window_id}: {err}"))?;

        let native_id = window.id();
        self.by_native_id.insert(native_id, window_id.clone());
        self.windows.insert(window_id.clone(), window);
        println!("window-opened id={window_id} native={native_id:?}");
        Ok(window_id)
    }

    fn close_window(&mut self, window_id: &str) -> Result<Value, String> {
        let window = self
            .windows
            .remove(window_id)
            .ok_or_else(|| format!("window not found: {window_id}"))?;
        self.by_native_id.remove(&window.id());
        drop(window);
        println!(
            "window-closed id={window_id} remaining={}",
            self.windows.len()
        );
        Ok(self.status())
    }

    fn close_native_window(&mut self, native_id: WindowId) {
        if let Some(window_id) = self.by_native_id.remove(&native_id) {
            self.windows.remove(&window_id);
            println!(
                "window-close-requested id={window_id} remaining={}",
                self.windows.len()
            );
        }
    }

    fn status(&self) -> Value {
        let mut ids = self.windows.keys().cloned().collect::<Vec<_>>();
        ids.sort();
        json!({
            "window_count": ids.len(),
            "window_ids": ids,
            "process_id": std::process::id(),
        })
    }

    fn handle_request(
        &mut self,
        request: IpcRequest,
        event_loop: &EventLoopWindowTarget<UserEvent>,
    ) -> IpcResponse {
        let started = Instant::now();
        let req_id = request.req_id;
        let result = match request.op.as_str() {
            "status" => Ok(self.status()),
            "open-window" => self.open_window(event_loop).map(|window_id| {
                json!({
                    "opened": window_id,
                    "elapsed_ms": started.elapsed().as_millis(),
                    "status": self.status(),
                })
            }),
            "close-window" => {
                let window_id = request
                    .window_id
                    .as_deref()
                    .ok_or_else(|| "close-window requires window_id".to_string());
                window_id.and_then(|id| self.close_window(id))
            }
            "quit" => Ok(json!({"quit": true, "status": self.status()})),
            other => Err(format!("unknown op: {other}")),
        };

        match result {
            Ok(data) => IpcResponse {
                req_id,
                ok: true,
                data,
                error: None,
            },
            Err(error) => IpcResponse {
                req_id,
                ok: false,
                data: json!({}),
                error: Some(error),
            },
        }
    }
}

fn main() {
    let socket_path = socket_path_from_args();
    if socket_path.exists() {
        let _ = fs::remove_file(&socket_path);
    }

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let socket_for_signal = socket_path.clone();
    let signal_proxy = proxy.clone();
    ctrlc::set_handler(move || {
        println!(
            "signal-received cleanup_socket={}",
            socket_for_signal.display()
        );
        let _ = fs::remove_file(&socket_for_signal);
        let _ = signal_proxy.send_event(UserEvent::Terminate("signal"));
    })
    .expect("failed to install ctrlc/SIGTERM handler");

    start_ipc_server(socket_path.clone(), proxy);

    let mut state = AppState::new();
    let mut cleanup_done = false;

    println!(
        "main-started pid={} socket={}",
        std::process::id(),
        socket_path.display()
    );

    event_loop.run(move |event, event_loop, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::NewEvents(StartCause::Init) => {
                for _ in 0..2 {
                    if let Err(err) = state.open_window(event_loop) {
                        eprintln!("{err}");
                        cleanup_socket_once(&socket_path, &mut cleanup_done);
                        *control_flow = ControlFlow::Exit;
                        return;
                    }
                }
                println!("initial-windows-ready {}", state.status());
            }
            Event::UserEvent(UserEvent::Request(request, reply)) => {
                let is_quit = request.op == "quit";
                let response = state.handle_request(request, event_loop);
                let _ = reply.send(response);
                if is_quit {
                    cleanup_socket_once(&socket_path, &mut cleanup_done);
                    *control_flow = ControlFlow::Exit;
                }
            }
            Event::UserEvent(UserEvent::Terminate(reason)) => {
                println!("terminating reason={reason}");
                cleanup_socket_once(&socket_path, &mut cleanup_done);
                *control_flow = ControlFlow::Exit;
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                window_id,
                ..
            } => {
                state.close_native_window(window_id);
            }
            Event::LoopDestroyed => {
                cleanup_socket_once(&socket_path, &mut cleanup_done);
                println!("loop-destroyed");
            }
            _ => {}
        }
    });
}

fn start_ipc_server(socket_path: PathBuf, proxy: EventLoopProxy<UserEvent>) {
    thread::spawn(move || {
        let name = match socket_path.clone().to_fs_name::<GenericFilePath>() {
            Ok(name) => name,
            Err(err) => {
                eprintln!("socket-name-error path={} err={err}", socket_path.display());
                return;
            }
        };

        let listener = match ListenerOptions::new().name(name).create_sync() {
            Ok(listener) => listener,
            Err(err) => {
                eprintln!("socket-bind-error path={} err={err}", socket_path.display());
                return;
            }
        };
        println!("ipc-listening socket={}", socket_path.display());

        for connection in listener.incoming() {
            match connection {
                Ok(stream) => {
                    let proxy = proxy.clone();
                    thread::spawn(move || handle_connection(stream, proxy));
                }
                Err(err) => eprintln!("ipc-accept-error {err}"),
            }
        }
    });
}

fn handle_connection(mut stream: LocalSocketStream, proxy: EventLoopProxy<UserEvent>) {
    let mut line = String::new();
    let read_result = {
        let mut reader = BufReader::new(&mut stream);
        reader.read_line(&mut line)
    };

    let response = match read_result {
        Ok(0) => IpcResponse {
            req_id: json!(null),
            ok: false,
            data: json!({}),
            error: Some("empty request".to_string()),
        },
        Ok(_) => match serde_json::from_str::<IpcRequest>(&line) {
            Ok(request) => dispatch_request(request, proxy),
            Err(err) => IpcResponse {
                req_id: json!(null),
                ok: false,
                data: json!({}),
                error: Some(format!("invalid json request: {err}")),
            },
        },
        Err(err) => IpcResponse {
            req_id: json!(null),
            ok: false,
            data: json!({}),
            error: Some(format!("read failed: {err}")),
        },
    };

    let _ = serde_json::to_writer(&mut stream, &response);
    let _ = stream.write_all(b"\n");
    let _ = stream.flush();
}

fn dispatch_request(request: IpcRequest, proxy: EventLoopProxy<UserEvent>) -> IpcResponse {
    let req_id = request.req_id.clone();
    let (tx, rx) = mpsc::channel();
    if let Err(err) = proxy.send_event(UserEvent::Request(request, tx)) {
        return IpcResponse {
            req_id,
            ok: false,
            data: json!({}),
            error: Some(format!("event loop unavailable: {err}")),
        };
    }

    match rx.recv() {
        Ok(response) => response,
        Err(err) => IpcResponse {
            req_id,
            ok: false,
            data: json!({}),
            error: Some(format!("response channel closed: {err}")),
        },
    }
}

fn cleanup_socket_once(socket_path: &PathBuf, cleanup_done: &mut bool) {
    if !*cleanup_done {
        let _ = fs::remove_file(socket_path);
        *cleanup_done = true;
        println!("socket-cleaned path={}", socket_path.display());
    }
}

fn socket_path_from_args() -> PathBuf {
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--socket" {
            if let Some(path) = args.next() {
                return PathBuf::from(path);
            }
        }
    }

    let uid = env::var("UID")
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    PathBuf::from(format!("/tmp/nf-test-{uid}.sock"))
}
