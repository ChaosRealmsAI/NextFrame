//! nf-shell entry point
#![deny(unused)]

use std::backtrace::Backtrace;
use std::env;
use std::fs::{create_dir_all, File};
use std::io::{self, Write};
use std::panic::{self, PanicHookInfo};
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

fn emit_trace(module: impl AsRef<str>, event: impl AsRef<str>, data: Value) {
    let line = json!({
        "ts": iso8601_utc_now(),
        "module": module.as_ref(),
        "event": event.as_ref(),
        "data": data,
    })
    .to_string();
    let _ = writeln!(io::stderr().lock(), "{line}");
}

fn emit_message(module_path: &str, message: String) {
    emit_trace(
        infer_module_name(module_path),
        "message",
        json!({ "message": message }),
    );
}

fn infer_module_name(module_path: &str) -> String {
    let mut segments = module_path.split("::");
    let crate_name = segments.next().unwrap_or(module_path);
    segments.next().map(str::to_owned).unwrap_or_else(|| {
        crate_name
            .rsplit('_')
            .next()
            .unwrap_or(crate_name)
            .to_owned()
    })
}

#[allow(unused_macro_rules)]
macro_rules! trace_log {
    ($($arg:tt)*) => {{
        $crate::emit_message(module_path!(), format!($($arg)*));
    }};
}

mod ai_ops;
mod ipc;
mod protocol;
#[cfg(test)]
mod tests;
mod window;

fn main() {
    install_panic_hook();
    if let Err(error) /* Internal: handled or logged locally below */ = window::run() {
        trace_log!("failed to start shell: {error}");
        std::process::exit(1);
    }
}

fn install_panic_hook() {
    let default_hook = panic::take_hook();
    panic::set_hook(Box::new(move |panic_info| {
        if let Err(error) /* Internal: handled or logged locally below */ = write_crash_dump(panic_info) {
            trace_log!("failed to write crash dump: {error}");
        }
        default_hook(panic_info);
    }));
}

#[allow(clippy::incompatible_msrv)]
fn write_crash_dump(panic_info: &PanicHookInfo<'_>) -> Result<(), String> {
    let timestamp = iso8601_utc_now();
    let crash_dir = crash_dir_path();
    create_dir_all(&crash_dir)
        .map_err(|error| format!("cannot create {}: {error}", crash_dir.display()))?;

    let file_path = crash_dir.join(format!(
        "crash-{}.json",
        filename_timestamp_token(&timestamp)
    ));
    let payload = serde_json::json!({
        "timestamp": timestamp,
        "message": panic_message(panic_info),
        "backtrace": Backtrace::force_capture().to_string(),
        "os": macos_version(),
    });
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("cannot encode crash dump JSON: {error}"))?;
    let mut file = File::create(&file_path)
        .map_err(|error| format!("cannot create {}: {error}", file_path.display()))?;
    file.write_all(json.as_bytes())
        .map_err(|error| format!("cannot write {}: {error}", file_path.display()))?;
    file.write_all(b"\n")
        .map_err(|error| format!("cannot finalize {}: {error}", file_path.display()))?;
    Ok(())
}

fn crash_dir_path() -> PathBuf {
    match env::var_os("HOME") {
        Some(home) => PathBuf::from(home).join(".nf-crash"),
        None => env::temp_dir().join(".nf-crash"),
    }
}

#[allow(clippy::incompatible_msrv)]
fn panic_message(panic_info: &PanicHookInfo<'_>) -> String {
    if let Some(message) = panic_info.payload().downcast_ref::<&str>() {
        return (*message).to_string();
    }
    if let Some(message) = panic_info.payload().downcast_ref::<String>() {
        return message.clone();
    }
    match panic_info.location() {
        Some(location) => format!(
            "panic at {}:{}:{}",
            location.file(),
            location.line(),
            location.column()
        ),
        None => "panic with non-string payload".to_string(),
    }
}

fn iso8601_utc_now() -> String {
    command_stdout("/bin/date", &["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .unwrap_or_else(unix_timestamp_fallback)
}

fn filename_timestamp_token(timestamp: &str) -> String {
    let token: String = timestamp
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect();
    if token.is_empty() {
        unix_epoch_seconds().to_string()
    } else {
        token
    }
}

fn macos_version() -> String {
    match command_stdout("/usr/bin/sw_vers", &["-productVersion"]) {
        Some(version) => format!("macOS {version}"),
        None => "macOS".to_string(),
    }
}

fn command_stdout(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn unix_timestamp_fallback() -> String {
    format!("unix-{}", unix_epoch_seconds())
}

fn unix_epoch_seconds() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs(),
        Err(_) /* Internal: fallback error branch handled below */ => 0,
    }
}
