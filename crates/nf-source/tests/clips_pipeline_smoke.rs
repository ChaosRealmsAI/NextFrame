use std::env;
use std::ffi::OsString;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus};

use anyhow::{Context, Result, bail};
use serde_json::Value;
use tempfile::{TempDir, tempdir};

struct Harness {
    root: TempDir,
    tools_dir: PathBuf,
    whisper_script: PathBuf,
    align_script: PathBuf,
}

impl Harness {
    fn new() -> Result<Self> {
        let root = tempdir().context("create test tempdir")?;
        let tools_dir = root.path().join("tools");
        fs::create_dir(&tools_dir).context("create fake tools dir")?;

        write_executable(
            &tools_dir.join("yt-dlp"),
            r#"#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_YTDLP_FAIL:-}" == "1" ]]; then
  echo "fake yt-dlp failure" >&2
  exit 12
fi

dump=0
output=""
while (($#)); do
  case "$1" in
    --dump-single-json)
      dump=1
      ;;
    --output)
      shift
      output="$1"
      ;;
  esac
  shift || true
done

if [[ "$dump" == "1" ]]; then
  printf '{"title":"Fake Source"}\n'
  exit 0
fi

path="${output//%(ext)s/mp4}"
mkdir -p "$(dirname "$path")"
printf 'fake video\n' > "$path"
"#,
        )?;
        write_executable(
            &tools_dir.join("ffmpeg"),
            r#"#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_FFMPEG_FAIL:-}" == "1" ]]; then
  echo "fake ffmpeg failure" >&2
  exit 13
fi

out="${@: -1}"
mkdir -p "$(dirname "$out")"
printf 'fake media\n' > "$out"
"#,
        )?;
        write_executable(
            &tools_dir.join("ffprobe"),
            r#"#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_FFPROBE_FAIL:-}" == "1" ]]; then
  echo "fake ffprobe failure" >&2
  exit 14
fi
printf '%s\n' "${FAKE_FFPROBE_DURATION:-1.0}"
"#,
        )?;
        write_executable(
            &tools_dir.join("python3"),
            r#"#!/usr/bin/env bash
set -euo pipefail
script="$1"
shift
exec "$script" "$@"
"#,
        )?;

        let whisper_script = tools_dir.join("fake_whisper.sh");
        write_executable(
            &whisper_script,
            r#"#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_WHISPER_FAIL:-}" == "1" ]]; then
  echo "fake whisper failure" >&2
  exit 15
fi
printf '{"language":"en","words":[{"text":"Hello","start":0.0,"end":0.4},{"text":"world.","start":0.4,"end":1.0}]}\n'
"#,
        )?;

        let align_script = tools_dir.join("fake_align.sh");
        write_executable(
            &align_script,
            r#"#!/usr/bin/env bash
set -euo pipefail
cat >/dev/null
if [[ "${FAKE_ALIGN_FAIL:-}" == "1" ]]; then
  echo "fake align failure" >&2
  exit 16
fi
printf '{"duration_ms":1000,"language":"en","units":[{"text":"Hello","start_ms":0,"end_ms":400},{"text":"world","start_ms":400,"end_ms":1000}]}\n'
"#,
        )?;

        Ok(Self {
            root,
            tools_dir,
            whisper_script,
            align_script,
        })
    }

    fn path(&self, name: &str) -> PathBuf {
        self.root.path().join(name)
    }

    fn command(&self) -> Result<Command> {
        let mut command = Command::new(env!("CARGO_BIN_EXE_nf-source"));
        command
            .env("PATH", prepend_path(&self.tools_dir)?)
            .env("VIDEOCUT_PYTHON_BIN", self.tools_dir.join("python3"))
            .env("VIDEOCUT_WHISPER_SCRIPT", &self.whisper_script)
            .env("VIDEOCUT_ALIGN_SCRIPT", &self.align_script);
        Ok(command)
    }
}

#[test]
fn download_smoke_is_hermetic_and_fails_nonzero() -> Result<()> {
    let harness = Harness::new()?;
    let out_dir = harness.path("download-ok");

    let status = harness
        .command()?
        .args([
            "download",
            "--url",
            "https://example.invalid/video",
            "--out-dir",
        ])
        .arg(&out_dir)
        .args(["--format-height", "720"])
        .status()
        .context("run nf-source download")?;

    assert_success(status, "download success")?;
    assert_file(out_dir.join("source.mp4"))?;
    let meta = read_json(out_dir.join("meta.json"))?;
    assert_eq!(meta["title"], "Fake Source");
    assert_eq!(meta["format"], "720p");
    assert_eq!(meta["duration_sec"], 1.0);

    let failed_status = harness
        .command()?
        .env("FAKE_YTDLP_FAIL", "1")
        .args([
            "download",
            "--url",
            "https://example.invalid/video",
            "--out-dir",
        ])
        .arg(harness.path("download-fail"))
        .status()
        .context("run failing nf-source download")?;
    assert_nonzero(failed_status, "download failure")
}

#[test]
fn transcribe_smoke_is_hermetic_and_fails_nonzero() -> Result<()> {
    let harness = Harness::new()?;
    let video = harness.path("input.mp4");
    fs::write(&video, "fake video").context("write fake input video")?;
    let out_dir = harness.path("transcribe-ok");

    let status = harness
        .command()?
        .args(["transcribe", "--video"])
        .arg(&video)
        .args(["--out-dir"])
        .arg(&out_dir)
        .args(["--model", "tiny", "--language", "en", "--jobs", "1"])
        .status()
        .context("run nf-source transcribe")?;

    assert_success(status, "transcribe success")?;
    assert_common_sentence_outputs(&out_dir)?;
    assert_file(out_dir.join("audio.wav"))?;
    assert_file(out_dir.join("words.json"))?;
    let sentences = read_json(out_dir.join("sentences.json"))?;
    assert_eq!(sentences["total_sentences"], 1);
    assert_eq!(sentences["sentences"][0]["text"], "Hello world.");

    let failed_status = harness
        .command()?
        .env("FAKE_WHISPER_FAIL", "1")
        .args(["transcribe", "--video"])
        .arg(&video)
        .args(["--out-dir"])
        .arg(harness.path("transcribe-fail"))
        .status()
        .context("run failing nf-source transcribe")?;
    assert_nonzero(failed_status, "transcribe failure")
}

#[test]
fn align_smoke_is_hermetic_and_fails_nonzero() -> Result<()> {
    let harness = Harness::new()?;
    let video = harness.path("input.mp4");
    let srt = harness.path("input.srt");
    fs::write(&video, "fake video").context("write fake input video")?;
    fs::write(&srt, "1\n00:00:00,000 --> 00:00:01,000\nHello world.\n")
        .context("write fake srt")?;
    let out_dir = harness.path("align-ok");

    let status = harness
        .command()?
        .args(["align", "--video"])
        .arg(&video)
        .args(["--srt-path"])
        .arg(&srt)
        .args(["--out-dir"])
        .arg(&out_dir)
        .args(["--language", "en"])
        .status()
        .context("run nf-source align")?;

    assert_success(status, "align success")?;
    assert_common_sentence_outputs(&out_dir)?;
    assert_file(out_dir.join("audio.wav"))?;
    let sentences = read_json(out_dir.join("sentences.json"))?;
    assert_eq!(sentences["total_sentences"], 1);
    assert_eq!(sentences["sentences"][0]["text"], "Hello world.");

    let failed_status = harness
        .command()?
        .env("FAKE_ALIGN_FAIL", "1")
        .args(["align", "--video"])
        .arg(&video)
        .args(["--srt-path"])
        .arg(&srt)
        .args(["--out-dir"])
        .arg(harness.path("align-fail"))
        .status()
        .context("run failing nf-source align")?;
    assert_nonzero(failed_status, "align failure")
}

#[test]
fn cut_smoke_is_hermetic_and_fails_nonzero() -> Result<()> {
    let harness = Harness::new()?;
    let video = harness.path("input.mp4");
    let sentences_path = harness.path("sentences.json");
    let plan_path = harness.path("plan.json");
    fs::write(&video, "fake video").context("write fake input video")?;
    write_sentences(&sentences_path)?;
    write_plan(&plan_path)?;
    let out_dir = harness.path("cut-ok");

    let status = harness
        .command()?
        .args(["cut", "--video"])
        .arg(&video)
        .args(["--sentences-path"])
        .arg(&sentences_path)
        .args(["--plan-path"])
        .arg(&plan_path)
        .args(["--out-dir"])
        .arg(&out_dir)
        .status()
        .context("run nf-source cut")?;

    assert_success(status, "cut success")?;
    assert_file(out_dir.join("clip_01.mp4"))?;
    let report = read_json(out_dir.join("cut_report.json"))?;
    assert_eq!(report["success"][0]["clip_num"], 1);
    assert_eq!(report["success"][0]["duration"], 1.0);
    assert_eq!(report["failed"].as_array().map(Vec::len), Some(0));

    let failed_out_dir = harness.path("cut-fail");
    let failed_status = harness
        .command()?
        .env("FAKE_FFMPEG_FAIL", "1")
        .args(["cut", "--video"])
        .arg(&video)
        .args(["--sentences-path"])
        .arg(&sentences_path)
        .args(["--plan-path"])
        .arg(&plan_path)
        .args(["--out-dir"])
        .arg(&failed_out_dir)
        .status()
        .context("run failing nf-source cut")?;
    assert_nonzero(failed_status, "cut failure")?;
    let failed_report = read_json(failed_out_dir.join("cut_report.json"))?;
    assert_eq!(failed_report["failed"][0]["cause"], "ffmpeg");

    Ok(())
}

fn write_executable(path: &Path, content: &str) -> Result<()> {
    fs::write(path, content).with_context(|| format!("write {}", path.display()))?;
    let mut permissions = fs::metadata(path)
        .with_context(|| format!("stat {}", path.display()))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .with_context(|| format!("chmod executable {}", path.display()))
}

fn prepend_path(dir: &Path) -> Result<OsString> {
    let mut paths = vec![dir.to_path_buf()];
    if let Some(existing) = env::var_os("PATH") {
        paths.extend(env::split_paths(&existing));
    }
    env::join_paths(paths).context("join PATH")
}

fn assert_common_sentence_outputs(out_dir: &Path) -> Result<()> {
    assert_file(out_dir.join("sentences.json"))?;
    assert_file(out_dir.join("sentences.srt"))?;
    assert_file(out_dir.join("sentences.txt"))?;
    assert_file(out_dir.join("meta.json"))
}

fn assert_file(path: PathBuf) -> Result<()> {
    if !path.is_file() {
        bail!("missing expected file {}", path.display());
    }
    Ok(())
}

fn read_json(path: PathBuf) -> Result<Value> {
    let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
    serde_json::from_str(&raw).with_context(|| format!("parse {}", path.display()))
}

fn write_sentences(path: &Path) -> Result<()> {
    fs::write(
        path,
        r#"{
  "version": "1",
  "source": "whisper_timestamped",
  "model": "fake",
  "language": "en",
  "audio_duration_sec": 1.0,
  "total_sentences": 1,
  "sentences": [
    {
      "id": 1,
      "start": 0.0,
      "end": 1.0,
      "text": "Hello world.",
      "words": [
        {"text": "Hello", "start": 0.0, "end": 0.4},
        {"text": "world.", "start": 0.4, "end": 1.0}
      ]
    }
  ]
}
"#,
    )
    .with_context(|| format!("write {}", path.display()))
}

fn write_plan(path: &Path) -> Result<()> {
    fs::write(
        path,
        r#"{
  "episode": "smoke",
  "total_sentences": 1,
  "clips": [
    {"id": 1, "from": 1, "to": 1, "title": "Smoke"}
  ],
  "bridges": [],
  "skipped": []
}
"#,
    )
    .with_context(|| format!("write {}", path.display()))
}

fn assert_success(status: ExitStatus, label: &str) -> Result<()> {
    if !status.success() {
        bail!("{label} exited with {:?}", status.code());
    }
    Ok(())
}

fn assert_nonzero(status: ExitStatus, label: &str) -> Result<()> {
    if status.success() {
        bail!("{label} unexpectedly exited successfully");
    }
    Ok(())
}
