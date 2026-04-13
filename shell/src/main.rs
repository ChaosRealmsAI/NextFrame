#![deny(unused)]

/// Logging macro that auto-prepends file:line for AI-readable logs.
macro_rules! trace_log {
    ($($arg:tt)*) => {
        eprintln!("[{}:{}] {}", file!(), line!(), format_args!($($arg)*))
    };
}

mod app;
mod app_control;
mod appctl_script;
mod http;
mod ipc;
mod protocol;
mod screenshot;

fn main() {
    if let Err(error) = app::run() {
        trace_log!("failed to start shell: {error}");
        std::process::exit(1);
    }
}
