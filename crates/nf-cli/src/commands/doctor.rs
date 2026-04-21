use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::commands::DoctorArgs;
use crate::errors::NfError;
use crate::ipc_client;

const RUST_MIN: Version = Version {
    major: 1,
    minor: 86,
};
const CARGO_MIN: Version = Version {
    major: 1,
    minor: 86,
};
const NODE_MIN: Version = Version {
    major: 20,
    minor: 0,
};
const MACOS_MIN: Version = Version {
    major: 13,
    minor: 0,
};
const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum CheckStatus {
    Pass,
    Fail,
    Warn,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct CheckResult {
    id: String,
    status: CheckStatus,
    actual: Option<String>,
    expected: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    hint: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Version {
    major: u64,
    minor: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Summary {
    total: usize,
    passed: usize,
    failed: usize,
    warnings: usize,
}

pub fn run(args: DoctorArgs) -> Result<(), NfError> {
    let checks = run_checks();
    let summary = summarize(&checks);
    let overall = overall_status(&checks);

    if args.human {
        print_human(&checks, summary, overall);
    } else {
        let report = json!({
            "checks": checks,
            "summary": {
                "total": summary.total,
                "passed": summary.passed,
                "failed": summary.failed,
                "warnings": summary.warnings,
            },
            "overall": overall,
        });
        println!("{}", serde_json::to_string_pretty(&report)?);
    }

    if summary.failed > 0 {
        std::process::exit(9);
    }

    Ok(())
}

fn run_checks() -> Vec<CheckResult> {
    vec![
        check_version_command(
            "rust_toolchain",
            "rustc",
            ["--version"],
            RUST_MIN,
            "Install via https://rustup.rs/",
        ),
        check_version_command(
            "cargo",
            "cargo",
            ["--version"],
            CARGO_MIN,
            "Install via https://rustup.rs/",
        ),
        check_version_command(
            "node",
            "node",
            ["--version"],
            NODE_MIN,
            "Install via brew install node",
        ),
        check_exists_command(
            "npm",
            "npm",
            ["--version"],
            "present",
            "Install via brew install node",
        ),
        check_nf_shell(),
        check_socket_dir(),
        check_home_nextframe(),
        check_macos_version(),
        check_display(),
    ]
}

fn check_version_command<I, S>(
    id: &str,
    program: &str,
    args: I,
    minimum: Version,
    hint: &str,
) -> CheckResult
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let expected = format!("≥ {}", minimum.display_requirement());
    match command_stdout(program, args) {
        Ok(output) => match parse_version(&output) {
            Some(actual) if actual >= minimum => pass(id, Some(actual.display()), expected),
            Some(actual) => fail(id, Some(actual.display()), expected, hint),
            None => fail(id, Some(output), expected, hint),
        },
        Err(err) => fail(id, None, expected, format!("{hint}; {err}")),
    }
}

fn check_exists_command<I, S>(
    id: &str,
    program: &str,
    args: I,
    expected: &str,
    hint: &str,
) -> CheckResult
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    match command_stdout(program, args) {
        Ok(output) => pass(id, Some(first_line(&output)), expected),
        Err(err) => fail(id, None, expected, format!("{hint}; {err}")),
    }
}

fn check_nf_shell() -> CheckResult {
    let path = PathBuf::from("./target/release/nf-shell");
    if !path.exists() {
        return fail(
            "nf_shell",
            None,
            "./target/release/nf-shell --version",
            "cargo build --release",
        );
    }

    match command_stdout(path.as_os_str(), ["--version"]) {
        Ok(output) => pass(
            "nf_shell",
            Some(first_line(&output)),
            "./target/release/nf-shell --version",
        ),
        Err(err) => fail(
            "nf_shell",
            Some(path.display().to_string()),
            "./target/release/nf-shell --version",
            format!("cargo build --release; {err}"),
        ),
    }
}

fn check_socket_dir() -> CheckResult {
    let socket = ipc_client::socket_path();
    let parent = socket.parent().unwrap_or_else(|| Path::new("/tmp"));
    if path_writable(parent) {
        pass(
            "socket",
            Some(socket.display().to_string()),
            "parent directory writable",
        )
    } else {
        fail(
            "socket",
            Some(socket.display().to_string()),
            "parent directory writable",
            "check /tmp permission",
        )
    }
}

fn check_home_nextframe() -> CheckResult {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return fail(
            "home_nextframe",
            None,
            "$HOME/.nextframe writable",
            "check HOME write permission",
        );
    };

    let nextframe = home.join(".nextframe");
    let path_to_check = if nextframe.exists() {
        nextframe.as_path()
    } else {
        home.as_path()
    };

    if path_writable(path_to_check) {
        pass(
            "home_nextframe",
            Some(nextframe.display().to_string()),
            "$HOME/.nextframe writable",
        )
    } else {
        fail(
            "home_nextframe",
            Some(nextframe.display().to_string()),
            "$HOME/.nextframe writable",
            "check HOME write permission",
        )
    }
}

fn check_macos_version() -> CheckResult {
    match command_stdout("sw_vers", ["-productVersion"]) {
        Ok(output) => match parse_version(&output) {
            Some(actual) if actual >= MACOS_MIN => pass(
                "macos",
                Some(actual.display()),
                format!("≥ {}", MACOS_MIN.display_requirement()),
            ),
            Some(actual) => fail(
                "macos",
                Some(actual.display()),
                format!("≥ {}", MACOS_MIN.display_requirement()),
                "NextFrame requires macOS 13+",
            ),
            None => fail(
                "macos",
                Some(output),
                format!("≥ {}", MACOS_MIN.display_requirement()),
                "NextFrame requires macOS 13+",
            ),
        },
        Err(err) => fail(
            "macos",
            None,
            format!("≥ {}", MACOS_MIN.display_requirement()),
            format!("NextFrame requires macOS 13+; {err}"),
        ),
    }
}

fn check_display() -> CheckResult {
    if std::env::var_os("DISPLAY").is_some_and(|value| !value.is_empty()) {
        return pass("display", Some("$DISPLAY".to_string()), "GUI session");
    }

    if cfg!(target_os = "macos") && command_success("pgrep", ["-x", "WindowServer"]) {
        return pass("display", Some("WindowServer".to_string()), "GUI session");
    }

    fail(
        "display",
        None,
        "$DISPLAY or macOS WindowServer",
        "are you in a GUI session?",
    )
}

fn command_stdout<I, S>(program: impl AsRef<OsStr>, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    command_stdout_timeout(program, args, PROBE_TIMEOUT)
}

fn command_stdout_timeout<I, S>(
    program: impl AsRef<OsStr>,
    args: I,
    timeout: Duration,
) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let program = program.as_ref().to_os_string();
    let args = args
        .into_iter()
        .map(|arg| arg.as_ref().to_os_string())
        .collect::<Vec<_>>();

    command_stdout_timeout_once(&program, &args, timeout).or_else(|err| {
        let Some(fallback) = locate_program(&program, timeout) else {
            return Err(err);
        };
        if fallback.as_os_str() == program.as_os_str() {
            return Err(err);
        }

        command_stdout_timeout_once(fallback.as_os_str(), &args, timeout).map_err(|fallback_err| {
            format!(
                "{err}; fallback {} failed: {fallback_err}",
                fallback.display()
            )
        })
    })
}

fn command_stdout_timeout_once(
    program: &OsStr,
    args: &[OsString],
    timeout: Duration,
) -> Result<String, String> {
    let mut command = Command::new(program);
    if let Some(path) = probe_path(
        std::env::var_os("HOME").as_deref(),
        std::env::var_os("PATH").as_deref(),
    ) {
        command.env("PATH", path);
    }

    let mut child = command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| err.to_string())?;

    let started = Instant::now();
    loop {
        if child.try_wait().map_err(|err| err.to_string())?.is_some() {
            let output = child.wait_with_output().map_err(|err| err.to_string())?;
            return output_to_result(output);
        }

        if started.elapsed() >= timeout {
            let _kill_result = child.kill();
            let _wait_result = child.wait();
            return Err(format!("timed out after {}s", timeout.as_secs()));
        }

        thread::sleep(Duration::from_millis(20));
    }
}

fn locate_program(program: &OsStr, timeout: Duration) -> Option<PathBuf> {
    let program_path = Path::new(program);
    if program_path.components().count() != 1 {
        return None;
    }

    let which_args = [program.to_os_string()];
    if let Ok(output) = command_stdout_timeout_once(OsStr::new("which"), &which_args, timeout) {
        let path = first_line(&output);
        if !path.is_empty() {
            return Some(PathBuf::from(path));
        }
    }

    cargo_home_bin(program).filter(|path| path.exists())
}

fn cargo_home_bin(program: &OsStr) -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(|home| PathBuf::from(home).join(".cargo/bin").join(program))
}

fn probe_path(home: Option<&OsStr>, path: Option<&OsStr>) -> Option<OsString> {
    let mut paths = Vec::new();

    if let Some(home) = home.filter(|value| !value.is_empty()) {
        paths.push(PathBuf::from(home).join(".cargo/bin"));
    }

    if let Some(path) = path.filter(|value| !value.is_empty()) {
        paths.extend(std::env::split_paths(path));
    }

    if paths.is_empty() {
        None
    } else {
        std::env::join_paths(paths).ok()
    }
}

fn output_to_result(output: std::process::Output) -> Result<String, String> {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        return Ok(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("exit status {}", output.status))
    } else {
        Err(stderr)
    }
}

fn command_success<I, S>(program: &str, args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    Command::new(program)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn parse_version(raw: &str) -> Option<Version> {
    for token in raw.split_whitespace() {
        let trimmed = token.trim_start_matches('v');
        let mut parts = trimmed.split('.');
        let Some(major) = parts.next().and_then(|value| value.parse().ok()) else {
            continue;
        };
        let minor = parts
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        return Some(Version { major, minor });
    }
    None
}

fn first_line(raw: &str) -> String {
    raw.lines().next().unwrap_or(raw).trim().to_string()
}

fn summarize(checks: &[CheckResult]) -> Summary {
    Summary {
        total: checks.len(),
        passed: checks
            .iter()
            .filter(|check| check.status == CheckStatus::Pass)
            .count(),
        failed: checks
            .iter()
            .filter(|check| check.status == CheckStatus::Fail)
            .count(),
        warnings: checks
            .iter()
            .filter(|check| check.status == CheckStatus::Warn)
            .count(),
    }
}

fn overall_status(checks: &[CheckResult]) -> CheckStatus {
    if checks.iter().any(|check| check.status == CheckStatus::Fail) {
        CheckStatus::Fail
    } else if checks.iter().any(|check| check.status == CheckStatus::Warn) {
        CheckStatus::Warn
    } else {
        CheckStatus::Pass
    }
}

fn print_human(checks: &[CheckResult], summary: Summary, overall: CheckStatus) {
    for check in checks {
        let icon = match check.status {
            CheckStatus::Pass => "✓",
            CheckStatus::Fail => "✗",
            CheckStatus::Warn => "!",
        };
        let actual = check.actual.as_deref().unwrap_or("not found");
        let mut line = format!(
            "{icon:<4} {id:<18} {actual:<24} ({expected})",
            id = check.id,
            expected = check.expected
        );
        if let Some(hint) = &check.hint {
            line.push_str(" hint: ");
            line.push_str(hint);
        }
        println!("{line}");
    }
    println!();
    println!(
        "Summary: {}/{} pass · {} fail · {} warn",
        summary.passed, summary.total, summary.failed, summary.warnings
    );
    println!("Overall: {}", status_label(overall));
}

fn pass(id: impl Into<String>, actual: Option<String>, expected: impl Into<String>) -> CheckResult {
    CheckResult {
        id: id.into(),
        status: CheckStatus::Pass,
        actual,
        expected: expected.into(),
        hint: None,
    }
}

fn fail(
    id: impl Into<String>,
    actual: Option<String>,
    expected: impl Into<String>,
    hint: impl Into<String>,
) -> CheckResult {
    CheckResult {
        id: id.into(),
        status: CheckStatus::Fail,
        actual,
        expected: expected.into(),
        hint: Some(hint.into()),
    }
}

#[cfg(unix)]
fn path_writable(path: &Path) -> bool {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};

    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_dir() {
        return false;
    }

    let mode = metadata.permissions().mode();
    let uid = current_uid();
    if uid == 0 {
        return true;
    }
    if metadata.uid() == uid {
        return mode & 0o200 != 0;
    }
    if metadata.gid() == current_gid() {
        return mode & 0o020 != 0;
    }
    mode & 0o002 != 0
}

#[cfg(not(unix))]
fn path_writable(path: &Path) -> bool {
    path.metadata()
        .map(|metadata| metadata.is_dir() && !metadata.permissions().readonly())
        .unwrap_or(false)
}

#[cfg(unix)]
fn current_uid() -> u32 {
    unsafe extern "C" {
        fn getuid() -> u32;
    }

    unsafe { getuid() }
}

#[cfg(unix)]
fn current_gid() -> u32 {
    unsafe extern "C" {
        fn getgid() -> u32;
    }

    unsafe { getgid() }
}

impl Version {
    fn display(self) -> String {
        format!("{}.{}", self.major, self.minor)
    }

    fn display_requirement(self) -> String {
        if self.minor == 0 {
            self.major.to_string()
        } else {
            self.display()
        }
    }
}

fn status_label(status: CheckStatus) -> &'static str {
    match status {
        CheckStatus::Pass => "PASS",
        CheckStatus::Fail => "FAIL",
        CheckStatus::Warn => "WARN",
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::time::Duration;

    use super::{
        fail, overall_status, parse_version, pass, probe_path, summarize, CheckResult, CheckStatus,
        Version, PROBE_TIMEOUT,
    };

    #[test]
    fn check_rust_toolchain_parse() -> Result<(), Box<dyn std::error::Error>> {
        let version =
            parse_version("rustc 1.86.0 (05f9846f8 2025-03-31)").ok_or("version should parse")?;

        assert_eq!(
            version,
            Version {
                major: 1,
                minor: 86
            }
        );
        assert!(
            version
                >= Version {
                    major: 1,
                    minor: 86
                }
        );

        Ok(())
    }

    #[test]
    fn summary_counts() {
        let checks = vec![
            pass("rust_toolchain", Some("1.86".to_string()), "≥ 1.86"),
            fail("node", None, "≥ 20", "Install via brew install node"),
            CheckResult {
                id: "ffmpeg".to_string(),
                status: CheckStatus::Warn,
                actual: None,
                expected: "present".to_string(),
                hint: Some("optional".to_string()),
            },
        ];

        let summary = summarize(&checks);

        assert_eq!(summary.total, 3);
        assert_eq!(summary.passed, 1);
        assert_eq!(summary.failed, 1);
        assert_eq!(summary.warnings, 1);
    }

    #[test]
    fn probe_path_prepends_cargo_bin() -> Result<(), Box<dyn std::error::Error>> {
        let path = probe_path(
            Some(std::ffi::OsStr::new("/tmp/fake-home")),
            Some(std::ffi::OsStr::new("/usr/bin")),
        )
        .ok_or("probe path should be built")?;
        let paths = std::env::split_paths(&path).collect::<Vec<_>>();

        assert_eq!(
            paths.first(),
            Some(&PathBuf::from("/tmp/fake-home/.cargo/bin"))
        );
        assert_eq!(paths.get(1), Some(&PathBuf::from("/usr/bin")));

        Ok(())
    }

    #[test]
    fn probe_timeout_is_15_seconds() {
        assert_eq!(PROBE_TIMEOUT, Duration::from_secs(15));
    }

    #[test]
    fn overall_priority() {
        let pass_check = pass("rust_toolchain", Some("1.86".to_string()), "≥ 1.86");
        let warn_check = CheckResult {
            id: "python".to_string(),
            status: CheckStatus::Warn,
            actual: None,
            expected: "present".to_string(),
            hint: Some("optional".to_string()),
        };
        let fail_check = fail("node", None, "≥ 20", "Install via brew install node");

        assert_eq!(
            overall_status(std::slice::from_ref(&pass_check)),
            CheckStatus::Pass
        );
        assert_eq!(
            overall_status(&[pass_check.clone(), warn_check.clone()]),
            CheckStatus::Warn
        );
        assert_eq!(
            overall_status(&[pass_check, warn_check, fail_check]),
            CheckStatus::Fail
        );
    }
}
