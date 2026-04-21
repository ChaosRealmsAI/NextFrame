//! whisper alignment process execution
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{anyhow, bail, Context, Result};

use super::parse::FfaOutput;

fn align_script_path() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("VOX_ALIGN_SCRIPT") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(path);
        }
    }

    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        let candidate = PathBuf::from(manifest_dir).join("scripts/align_ffa.py");
        if candidate.exists() {
            return Some(candidate);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        for parent in exe.ancestors() {
            let candidate = parent.join("scripts/align_ffa.py");
            if candidate.exists() {
                return Some(candidate);
            }

            let candidate = parent.join("vox/scripts/align_ffa.py");
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

pub(super) fn run_ffa(audio_path: &Path, original_text: &str) -> Result<FfaOutput> {
    let script = align_script_path()
        .ok_or_else(|| anyhow!("scripts/align_ffa.py not found (set VOX_ALIGN_SCRIPT)"))?;
    let language = detect_language(original_text).unwrap_or("en");

    let mut child = Command::new("python3")
        .arg(&script)
        .arg(audio_path.as_os_str())
        .arg(language)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("failed to spawn python3 for whisperX alignment")?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(original_text.as_bytes())
            .context("failed to pipe original text to align script")?;
    }

    let output = child
        .wait_with_output()
        .context("failed to wait on whisperX alignment subprocess")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!(
            "whisperX alignment failed (exit {:?}): {}",
            output.status.code(),
            stderr.trim()
        );
    }

    let stdout = std::str::from_utf8(&output.stdout)
        .context("whisperX alignment output is not valid UTF-8")?
        .trim();
    if stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!(
            "whisperX alignment produced empty output: {}",
            stderr.trim()
        );
    }

    serde_json::from_str::<FfaOutput>(stdout).with_context(|| {
        let stderr = String::from_utf8_lossy(&output.stderr);
        format!(
            "failed to parse whisperX alignment JSON: {}; stderr: {}",
            stdout,
            stderr.trim()
        )
    })
}

fn detect_language(text: &str) -> Option<&'static str> {
    let mut cjk = 0u32;
    let mut jp = 0u32;
    let mut kr = 0u32;
    let mut total = 0u32;

    for ch in text.chars() {
        if !ch.is_alphabetic() {
            continue;
        }
        total += 1;
        match ch as u32 {
            0x4E00..=0x9FFF => cjk += 1,
            0x3040..=0x30FF => jp += 1,
            0xAC00..=0xD7AF | 0x1100..=0x11FF => kr += 1,
            _ => {}
        }
    }

    if total == 0 {
        return None;
    }
    if jp > 0 {
        return Some("ja");
    }
    if kr > 0 {
        return Some("ko");
    }
    if cjk * 100 / total > 30 {
        return Some("zh");
    }
    Some("en")
}

#[cfg(test)]
mod tests {
    use super::detect_language;

    #[test]
    fn detect_language_chinese() {
        assert_eq!(detect_language("你好世界"), Some("zh"));
    }

    #[test]
    fn detect_language_english() {
        assert_eq!(detect_language("hello world"), Some("en"));
    }

    #[test]
    fn detect_language_japanese() {
        assert_eq!(detect_language("こんにちは"), Some("ja"));
    }
}
