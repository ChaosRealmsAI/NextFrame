use std::io::Write;
use std::sync::Arc;

use nf_shell::events::UserEvent;
use nf_shell::handlers::app::AppOpHandler;
use nf_shell::handlers::ComposeOpHandler;
use nf_shell::ipc_server::{self, ok_response};
use nf_shell::window_manager::WindowManager;
use tao::event::{Event, StartCause, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};

fn main() {
    let mut builder = EventLoopBuilder::<UserEvent>::with_user_event();
    let event_loop = builder.build();
    let proxy = event_loop.create_proxy();
    let handler = match ComposeOpHandler::from_default_storage() {
        Ok(handler) => Arc::new(handler),
        Err(err) => {
            eprintln!("{}", err.to_record().detail);
            std::process::exit(i32::from(err.exit_code()));
        }
    };

    if let Err(err) = ipc_server::spawn_server_thread(proxy.clone(), handler) {
        eprintln!("nf-shell IPC failed to start: {err}");
        std::process::exit(1);
    }

    let socket_path = ipc_server::socket_path();
    let mut stdout = std::io::stdout().lock();
    let _write_result = writeln!(
        stdout,
        "{{\"event\":\"ready\",\"bin\":\"nf-shell\",\"version\":\"{}\",\"sock\":\"{}\"}}",
        env!("CARGO_PKG_VERSION"),
        socket_path.display()
    );
    let _flush_result = stdout.flush();

    let mut manager = WindowManager::new();

    event_loop.run(move |event, target, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => {}
            Event::LoopDestroyed => {
                manager.quit_all();
                let _cleanup_result = std::fs::remove_file(ipc_server::socket_path());
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                window_id,
                ..
            } => {
                let _removed = manager.remove_by_tao_window_id(window_id);
            }
            Event::UserEvent(event) => match event {
                UserEvent::OpenWindow { request, ack } => {
                    let response = AppOpHandler::open(&mut manager, target, &proxy, request);
                    let _send_result = ack.send(response);
                }
                UserEvent::CloseWindow { request, ack } => {
                    let response = AppOpHandler::close(&mut manager, request);
                    let _send_result = ack.send(response);
                }
                UserEvent::StateQuery { request, ack } => {
                    let response = AppOpHandler::state_query(&manager, request);
                    let _send_result = ack.send(response);
                }
                UserEvent::ClickSim { request, ack } => {
                    AppOpHandler::click(&manager, request, ack);
                }
                UserEvent::Screenshot { request, ack } => {
                    AppOpHandler::screenshot(&manager, request, ack);
                }
                UserEvent::DevtoolsQuery { request, ack } => {
                    AppOpHandler::devtools_query(&manager, request, ack);
                }
                UserEvent::IpcFromJs { window_id, body } => {
                    let mut stdout = std::io::stdout().lock();
                    let event = serde_json::json!({
                        "event": "ipc-from-js",
                        "window_id": window_id,
                        "body": body
                    });
                    let _write_result = writeln!(stdout, "{}", event);
                    let _flush_result = stdout.flush();
                }
                UserEvent::Quit { request, ack } => {
                    manager.quit_all();
                    let _cleanup_result = std::fs::remove_file(ipc_server::socket_path());
                    let response = ok_response(&request, serde_json::json!({ "quit": true }));
                    let _send_result = ack.send(response);
                    *control_flow = ControlFlow::Exit;
                }
            },
            _ => {}
        }
    });
}
