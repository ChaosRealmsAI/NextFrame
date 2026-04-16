//! state event helpers
use chrono::{Local, SecondsFormat};

use super::SessionHistoryEntry;
use super::persistence;

pub(crate) fn write_stderr_line(args: std::fmt::Arguments<'_>) {
    use std::io::{self, Write};

    let mut stderr = io::stderr().lock();
    let _ = stderr.write_fmt(args);
    let _ = stderr.write_all(b"\n");
}

pub(crate) fn timestamp_now() -> String {
    Local::now().to_rfc3339_opts(SecondsFormat::Secs, false)
}

pub(crate) fn trim_history(history: &mut Vec<SessionHistoryEntry>) {
    let excess = history.len().saturating_sub(100);
    if excess > 0 {
        history.drain(0..excess);
    }
}

pub(crate) fn log_activity(event_type: &str, platform: &str, details: &str) {
    use std::io::Write;

    let ts = timestamp_now();
    let entry = serde_json::json!({
        "ts": ts,
        "type": event_type,
        "platform": platform,
        "details": details,
    });
    let path = persistence::state_dir().join("activity.jsonl");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(file, "{}", entry);
        let _ = file.flush();
    }
}

pub(crate) fn log_crash(level: &str, location: &str, message: &str) {
    use std::io::Write;

    let ts = timestamp_now();
    let line = format!("[{ts}] {level} {location}: {message}");
    write_stderr_line(format_args!("{line}"));
    let path = persistence::state_dir().join("crash.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(file, "{}", line);
        let _ = file.flush();
    }
    log_activity("crash", location, &format!("{level}: {message}"));
}

pub(crate) fn read_activity_log(last_n: usize) -> String {
    let path = persistence::state_dir().join("activity.jsonl");
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(last_n);
    lines[start..].join("\n")
}
