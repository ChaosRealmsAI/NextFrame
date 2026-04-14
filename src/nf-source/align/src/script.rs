//! Helper-process resolution and invocation for forced alignment.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use anyhow::{Context, Result, bail};
use nf_cut_core::python_bin;

use crate::AlignOutput;

/// Run the Python align helper and decode its JSON response.
pub(crate) fn run_align_script(
    audio_path: &Path,
    language: &str,
    text: &str,
) -> Result<AlignOutput> {
    let script = align_script_path()?;
    let python = python_bin(
        "VIDEOCUT_PYTHON_BIN",
        Path::new("/Users/Zhuanz/.venvs/align/bin/python3"),
    );
    let mut child = Command::new(&python)
        .arg(&script)
        .arg(audio_path)
        .arg(language)
        .env("TQDM_DISABLE", "1")
        .env("PYTHONUNBUFFERED", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("spawn align helper via {python}"))?;

    {
        let mut stdin = child.stdin.take().context("open align helper stdin")?;
        stdin
            .write_all(text.as_bytes())
            .context("write subtitle text to align helper")?;
    }

    let output = child.wait_with_output().context("wait for align helper")?;
    if !output.status.success() {
        bail!(
            "align helper failed (exit {:?}): {}",
            output.status.code(),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    serde_json::from_slice(&output.stdout).with_context(|| {
        format!(
            "parse align helper output: {}",
            String::from_utf8_lossy(&output.stdout)
        )
    })
}

/// Resolve the helper script path from overrides, source tree, or the executable layout.
pub(crate) fn align_script_path() -> Result<PathBuf> {
    if let Ok(path) = std::env::var("VIDEOCUT_ALIGN_SCRIPT") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let source_tree = manifest
        .parent()
        .and_then(Path::parent)
        .map(|root| root.join("nf-tts/scripts/align_ffa.py"))
        .filter(|path| path.exists());
    if let Some(path) = source_tree {
        return Ok(path);
    }

    let exe = std::env::current_exe().context("resolve current executable")?;
    for parent in exe.ancestors() {
        for relative in [
            "src/nf-tts/scripts/align_ffa.py",
            "nf-tts/scripts/align_ffa.py",
        ] {
            let candidate = parent.join(relative);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    bail!("src/nf-tts/scripts/align_ffa.py not found (set VIDEOCUT_ALIGN_SCRIPT)")
}
