/// Logging macro that auto-prepends file:line for AI-readable logs.
/// Usage: `trace_log!("message {}", value)` → `[bridge/src/export.rs:42] message value`
macro_rules! trace_log {
    ($($arg:tt)*) => {
        eprintln!("[{}:{}] {}", file!(), line!(), format_args!($($arg)*))
    };
}
