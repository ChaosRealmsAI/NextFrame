use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use regex::Regex;
use serde_json::{Value, json};

use crate::{config::BashPermissionConfig, skill::SkillRegistry};

#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn input_schema(&self) -> Value;
    async fn call(&self, args: Value) -> Result<Value>;
    fn concurrency_safe(&self) -> bool {
        false
    }
}

const DEFAULT_BASH_TIMEOUT_SEC: u64 = 120;

#[derive(Debug, Clone)]
pub struct BashTool {
    default_timeout_sec: u64,
    permission: BashPermission,
}

impl BashTool {
    pub fn new(default_timeout_sec: u64) -> Self {
        Self::with_permission(default_timeout_sec, BashPermission::default())
    }

    pub fn with_permission(default_timeout_sec: u64, permission: BashPermission) -> Self {
        Self {
            default_timeout_sec,
            permission,
        }
    }
}

impl Default for BashTool {
    fn default() -> Self {
        Self::new(DEFAULT_BASH_TIMEOUT_SEC)
    }
}

#[async_trait]
impl Tool for BashTool {
    fn name(&self) -> &str {
        "Bash"
    }

    fn description(&self) -> &str {
        "Run a command with bash -c. Captures stdout, stderr, and exit_code."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Command to run"
                },
                "timeout_sec": {
                    "type": "integer",
                    "description": "Timeout in seconds",
                    "default": self.default_timeout_sec
                }
            },
            "required": ["command"],
            "additionalProperties": false
        })
    }

    async fn call(&self, args: Value) -> Result<Value> {
        let command = required_string(&args, "command")?;
        if let Err(reason) = self.permission.check(&command) {
            log::warn!("bash denied: {reason} · cmd: {command}");
            return Ok(json!({
                "ok": false,
                "denied": true,
                "reason": reason,
                "command": command,
            }));
        }
        let timeout_sec = optional_u64(&args, "timeout_sec", self.default_timeout_sec);
        tokio::task::spawn_blocking(move || run_bash(command, timeout_sec))
            .await
            .context("bash worker task failed")?
    }
}

#[derive(Debug, Clone)]
pub struct BashPermission {
    blocklist: Vec<Regex>,
    allowlist: Vec<Regex>,
    strict: bool,
}

impl BashPermission {
    pub fn default_blocklist() -> Vec<&'static str> {
        vec![
            r"^sudo\s",
            r"rm\s+-rf\s+(/$|/\s|/\*|~|\$HOME)",
            r"^dd\s+.*of=/dev/",
            r"git\s+push\s+--force(-with-lease)?\s+.*\s+(main|master)",
            r"curl\s+.*\|\s*(sh|bash)",
            r"wget\s+.*\|\s*(sh|bash)",
        ]
    }

    pub fn from_config(config: &BashPermissionConfig) -> Result<Self> {
        let mut blocklist = Self::default_blocklist()
            .into_iter()
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        blocklist.extend(config.blocklist.iter().cloned());

        let strict = match config.allowlist_mode.as_str() {
            "open" => false,
            "strict" => true,
            other => return Err(anyhow!("invalid bash_permission.allowlist_mode: {other}")),
        };

        Ok(Self {
            blocklist: compile_regexes("bash_permission.blocklist", &blocklist)?,
            allowlist: compile_regexes("bash_permission.allowlist", &config.allowlist)?,
            strict,
        })
    }

    pub fn check(&self, cmd: &str) -> Result<(), String> {
        for pat in &self.blocklist {
            if pat.is_match(cmd) {
                return Err(format!("matched blocklist: {}", pat.as_str()));
            }
        }
        if self.strict {
            let allowed = self.allowlist.iter().any(|pat| pat.is_match(cmd));
            if !allowed {
                return Err("no allowlist match (strict mode)".to_owned());
            }
        }
        Ok(())
    }

    pub fn deny_all() -> Self {
        Self {
            blocklist: Vec::new(),
            allowlist: Vec::new(),
            strict: true,
        }
    }
}

impl Default for BashPermission {
    fn default() -> Self {
        let config = BashPermissionConfig::default();
        match Self::from_config(&config) {
            Ok(permission) => permission,
            Err(err) => {
                log::error!("failed to compile default bash permission rules: {err:#}");
                Self::deny_all()
            }
        }
    }
}

fn compile_regexes(label: &str, patterns: &[String]) -> Result<Vec<Regex>> {
    patterns
        .iter()
        .map(|pattern| {
            Regex::new(pattern).with_context(|| format!("invalid regex in {label}: {pattern}"))
        })
        .collect()
}

fn run_bash(command: String, timeout_sec: u64) -> Result<Value> {
    let timeout = Duration::from_secs(timeout_sec);
    let started = Instant::now();
    let mut cmd = Command::new("bash");
    cmd.arg("-c")
        .arg(&command)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    let mut child = cmd
        .spawn()
        .with_context(|| format!("failed to spawn bash for command: {command}"))?;

    let deadline = started + timeout;
    loop {
        if child
            .try_wait()
            .context("failed while waiting for bash command")?
            .is_some()
        {
            let output = child
                .wait_with_output()
                .context("failed to collect bash output")?;
            return Ok(json!({
                "ok": output.status.success(),
                "timed_out": false,
                "stdout": String::from_utf8_lossy(&output.stdout).into_owned(),
                "stderr": String::from_utf8_lossy(&output.stderr).into_owned(),
                "exit_code": output.status.code().unwrap_or(1),
                "elapsed_sec": started.elapsed().as_secs()
            }));
        }

        if Instant::now() >= deadline {
            kill_bash_child(&mut child);
            let output = child
                .wait_with_output()
                .context("failed to collect timed out bash output")?;
            let mut stderr = String::from_utf8_lossy(&output.stderr).into_owned();
            if !stderr.is_empty() && !stderr.ends_with('\n') {
                stderr.push('\n');
            }
            stderr.push_str(&format!("command timed out after {timeout_sec}s"));
            return Ok(json!({
                "ok": false,
                "timed_out": true,
                "timeout_sec": timeout_sec,
                "elapsed_sec": started.elapsed().as_secs().max(timeout_sec),
                "command": command,
                "stdout": String::from_utf8_lossy(&output.stdout).into_owned(),
                "stderr": stderr,
                "exit_code": 124
            }));
        }

        thread::sleep(Duration::from_millis(20));
    }
}

fn kill_bash_child(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id();
        let status = Command::new("kill")
            .arg("-KILL")
            .arg(format!("-{pid}"))
            .status();
        if matches!(status, Ok(exit) if exit.success()) {
            return;
        }
    }

    let _ = child.kill();
}

#[derive(Debug, Clone, Default)]
pub struct ReadTool;

#[async_trait]
impl Tool for ReadTool {
    fn name(&self) -> &str {
        "Read"
    }

    fn description(&self) -> &str {
        "Read a UTF-8 text file, replacing invalid bytes, with a max character limit."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to read"
                },
                "max_chars": {
                    "type": "integer",
                    "description": "Maximum characters to return",
                    "default": 10000
                }
            },
            "required": ["path"],
            "additionalProperties": false
        })
    }

    async fn call(&self, args: Value) -> Result<Value> {
        let path = required_string(&args, "path")?;
        let max_chars = optional_u64(&args, "max_chars", 10_000);
        tokio::task::spawn_blocking(move || read_file(path, max_chars))
            .await
            .context("read worker task failed")?
    }

    fn concurrency_safe(&self) -> bool {
        true
    }
}

fn read_file(path: String, max_chars: u64) -> Result<Value> {
    let bytes = std::fs::read(&path).with_context(|| format!("failed to read file {path}"))?;
    let content = String::from_utf8_lossy(&bytes)
        .chars()
        .take(usize::try_from(max_chars).unwrap_or(10_000))
        .collect::<String>();
    Ok(json!({
        "ok": true,
        "path": path,
        "content": content
    }))
}

#[derive(Debug, Clone)]
pub struct LoadSkillTool {
    registry: Arc<SkillRegistry>,
}

impl LoadSkillTool {
    pub fn new(registry: Arc<SkillRegistry>) -> Self {
        Self { registry }
    }
}

#[async_trait]
impl Tool for LoadSkillTool {
    fn name(&self) -> &str {
        "load_skill"
    }

    fn description(&self) -> &str {
        "Load an external skill markdown file by name."
    }

    fn input_schema(&self) -> Value {
        let names = self.registry.names();
        let descriptions = self.registry.descriptions().join(", ");
        json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "enum": names,
                    "description": format!("Skill name. Available: {descriptions}")
                }
            },
            "required": ["name"],
            "additionalProperties": false
        })
    }

    async fn call(&self, args: Value) -> Result<Value> {
        let name = required_string(&args, "name")?;
        let Some(skill) = self.registry.get(&name) else {
            return Ok(json!({
                "ok": false,
                "error": format!("unknown skill: {name}"),
                "available": self.registry.names()
            }));
        };
        Ok(json!({
            "ok": true,
            "skill": skill.name,
            "description": skill.description,
            "path": skill.path,
            "content": skill.content
        }))
    }

    fn concurrency_safe(&self) -> bool {
        true
    }
}

#[derive(Debug, Clone)]
pub struct VerifyOutputsTool {
    skills: Arc<SkillRegistry>,
    workspace: PathBuf,
}

impl VerifyOutputsTool {
    pub fn new(skills: Arc<SkillRegistry>, workspace: impl Into<PathBuf>) -> Self {
        Self {
            skills,
            workspace: workspace.into(),
        }
    }
}

#[async_trait]
impl Tool for VerifyOutputsTool {
    fn name(&self) -> &str {
        "verify_outputs"
    }

    fn description(&self) -> &str {
        "Verify expected outputs exist per skill. Returns present/missing lists."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "skill": {
                    "type": "string",
                    "description": "Skill name to verify"
                }
            },
            "required": ["skill"],
            "additionalProperties": false
        })
    }

    async fn call(&self, args: Value) -> Result<Value> {
        let skill_name = required_string(&args, "skill")?;
        let skill = self
            .skills
            .get(&skill_name)
            .with_context(|| format!("skill not found: {skill_name}"))?;

        let workspace = self.workspace.clone();
        let expected_outputs = skill.expected_outputs.clone();
        tokio::task::spawn_blocking(move || {
            verify_outputs_for_patterns(&workspace, &skill_name, &expected_outputs)
        })
        .await
        .context("verify_outputs worker task failed")?
    }

    fn concurrency_safe(&self) -> bool {
        true
    }
}

pub fn verify_outputs_for_patterns(
    workspace: &Path,
    skill_name: &str,
    expected_outputs: &[String],
) -> Result<Value> {
    let mut present = Vec::new();
    let mut missing = Vec::new();

    for pattern in expected_outputs {
        let abs_pattern = workspace.join(pattern);
        let pattern_text = abs_pattern.to_str().with_context(|| {
            format!("glob pattern is not valid UTF-8: {}", abs_pattern.display())
        })?;
        let mut matches = glob::glob(pattern_text)
            .with_context(|| format!("invalid glob pattern: {pattern}"))?
            .filter_map(|path| path.ok())
            .collect::<Vec<_>>();
        matches.sort();

        if matches.is_empty() {
            missing.push(pattern.clone());
        } else {
            present.extend(matches.into_iter().map(|path| path.display().to_string()));
        }
    }

    Ok(json!({
        "skill": skill_name,
        "present": present,
        "missing": missing,
        "all_present": missing.is_empty(),
    }))
}

pub fn openai_tool_schema(tool: &dyn Tool) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": tool.name(),
            "description": tool.description(),
            "parameters": tool.input_schema()
        }
    })
}

fn required_string(args: &Value, key: &str) -> Result<String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow!("missing or invalid string argument `{key}`"))
}

fn optional_u64(args: &Value, key: &str, default: u64) -> u64 {
    args.get(key).and_then(Value::as_u64).unwrap_or(default)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::*;

    #[test]
    fn verify_outputs_reports_present_and_missing_patterns() -> Result<()> {
        let workspace = unique_temp_dir("nf-agent-verify-workspace")?;
        fs::create_dir_all(workspace.join("outputs"))
            .with_context(|| format!("failed to create {}", workspace.display()))?;
        fs::write(workspace.join("outputs/index.html"), "")
            .with_context(|| format!("failed to write {}", workspace.display()))?;

        let expected_outputs = vec![
            "**/outputs/index.html".to_owned(),
            "**/outputs/item_*.json".to_owned(),
        ];
        let result = verify_outputs_for_patterns(&workspace, "demo", &expected_outputs)?;

        assert_eq!(result["skill"].as_str(), Some("demo"));
        assert_eq!(result["all_present"].as_bool(), Some(false));
        assert_eq!(
            result["missing"].as_array().and_then(|items| items.first()),
            Some(&json!("**/outputs/item_*.json"))
        );
        let present = result["present"].as_array().cloned().unwrap_or_default();
        assert_eq!(present.len(), 1);

        fs::remove_dir_all(&workspace)
            .with_context(|| format!("failed to remove {}", workspace.display()))?;
        Ok(())
    }

    fn unique_temp_dir(prefix: &str) -> Result<PathBuf> {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .context("system time before unix epoch")?
            .as_nanos();
        Ok(std::env::temp_dir().join(format!("{prefix}-{}-{nanos}", std::process::id())))
    }
}
