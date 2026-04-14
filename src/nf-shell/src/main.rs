//! nf-shell entry point
#![deny(unused)]

/// Logging macro that auto-prepends file:line for AI-readable logs.
macro_rules! trace_log {
    ($($arg:tt)*) => {
        eprintln!("[{}:{}] {}", file!(), line!(), format_args!($($arg)*))
    };
}

mod ai_ops;
mod ipc;
mod protocol;
mod window;

fn main() {
    if let Err(error) = window::run() {
        trace_log!("failed to start shell: {error}");
        std::process::exit(1);
    }
}
