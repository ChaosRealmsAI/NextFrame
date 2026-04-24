# D2 Quality Review: clips pipeline

Date: 2026-04-21

Scope:

- `crates/nf-source`
- `crates/videocut-core`
- `crates/videocut-download`
- `crates/videocut-transcribe`
- `crates/videocut-align`
- `crates/videocut-cut`

Review focus: panic/unwrap/expect lint deny coverage, error handling, `Result` propagation, thread safety, FFI, async calls.

## Verification

Commands run:

```text
cargo clippy -p nf-source -p videocut-core -p videocut-download -p videocut-transcribe -p videocut-align -p videocut-cut --all-targets
```

Result: pass.

```text
cargo test -p nf-source -p videocut-core -p videocut-download -p videocut-transcribe -p videocut-align -p videocut-cut
```

Result: fail in `videocut-align` because the repository layout used by this worktree does not contain `python/align_ffa.py`.

```text
test tests::align_script_resolves_from_source_tree ... FAILED
Error: python/align_ffa.py not found (set VIDEOCUT_ALIGN_SCRIPT)
```

Lint deny coverage found in workspace:

```toml
# Cargo.toml:28
[workspace.lints.clippy]
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
unreachable = "deny"
todo = "deny"
wildcard_imports = "deny"
```

Direct scan result:

- No production `panic!`, `unwrap()`, `expect()`, `todo!`, `unimplemented!`, or `unreachable!` found in scoped crates.
- Assertions are confined to tests.
- `unsafe` in scoped crates is confined to `videocut-core/src/python.rs` tests for serialized environment mutation.
- No `async`, `.await`, Tokio runtime, or manual async bridge found in scoped crates.
- No FFI boundary (`extern "C"`, `no_mangle`, raw-retain APIs) found in scoped production code.

## P0

None found.

No immediate memory-safety, data-race, production panic, or FFI/async unsoundness issue was identified in the reviewed scope.

## P1

### P1-1: `nf-source cut` can exit successfully even when clip cutting failed

Category: error handling, `Result` propagation

Impact: `cut_plan` records per-clip failures in `CutReport`, but it still returns `Ok(report)` after failed cuts. `nf-source cut` then writes the report, prints a summary, and returns `Ok(())`. CI, scripts, or downstream orchestration that rely on process exit status can treat an all-failed or partially failed cut stage as successful.

Evidence:

```rust
// crates/videocut-cut/src/lib.rs:61
for clip in &plan.clips {
    match cut_one(
        &options.video,
        &sentences,
        clip,
        &options.out_dir,
        options.margin_sec,
    ) {
        Ok(result) => {
            on_progress(&ProgressEvent {
                clip_num: result.clip_num,
                status: "ok",
                file: Some(result.file.clone()),
                start: Some(result.start),
                end: Some(result.end),
                duration: Some(result.duration),
                error: None,
            });
            report.success.push(result);
        }
        Err((failure, cause)) => {
            on_progress(&ProgressEvent {
                clip_num: failure.clip_num,
                status: "failed",
                file: None,
                start: None,
                end: None,
                duration: None,
                error: Some(failure.error.clone()),
            });
            report.failed.push(ClipFailure { cause, ..failure });
        }
    }
}

Ok(report)
```

```rust
// crates/nf-source/src/cmd_cut.rs:23
)?;

report.write_to_path(&report_path)?;
print_summary(&report);
Ok(())
```

Recommendation: keep the batch report behavior, but make the CLI stage fail when `report.failed` is non-empty, or add an explicit CLI flag such as `--allow-partial` if partial success is intentional.

### P1-2: External command failures often discard stderr

Category: error handling, diagnostics

Impact: several critical `ffmpeg` / `yt-dlp` paths use `.status()` and report only the exit code. Because stderr is not captured, common failures such as unsupported codec, missing input stream, bad URL, permission error, or merge failure lose the actionable root cause. This is inconsistent with the metadata path, which captures stderr via `.output()`.

Evidence:

```rust
// crates/videocut-cut/src/lib.rs:100
pub fn cut_clip(video: &Path, start_sec: f64, duration_sec: f64, output: &Path) -> Result<()> {
    let status = Command::new("ffmpeg")
        // args omitted
        .arg("-loglevel")
        .arg("error")
        .arg(output)
        .status()
        .context("run ffmpeg cut")?;

    if !status.success() {
        bail!("ffmpeg cut failed with exit {:?}", status.code());
    }
    Ok(())
}
```

```rust
// crates/videocut-core/src/media.rs:9
pub fn extract_audio_to_wav(video: &Path, wav_path: &Path) -> Result<()> {
    let status = Command::new("ffmpeg")
        // args omitted
        .status()
        .context("run ffmpeg for audio extraction")?;

    if !status.success() {
        bail!(
            "ffmpeg audio extraction failed with exit {:?}",
            status.code()
        );
    }
```

```rust
// crates/videocut-transcribe/src/audio.rs:9
pub fn slice_wav(input: &Path, start_sec: f64, duration_sec: f64, output: &Path) -> Result<()> {
    let status = Command::new("ffmpeg")
        // args omitted
        .status()
        .context("run ffmpeg for audio slice")?;

    if !status.success() {
        bail!("ffmpeg audio slice failed with exit {:?}", status.code());
    }
    Ok(())
}
```

```rust
// crates/videocut-download/src/lib.rs:150
fn run_download(options: &DownloadOptions) -> Result<()> {
    let output_template = options.out_dir.join("source.%(ext)s");
    let status = Command::new("yt-dlp")
        // args omitted
        .status()
        .context("run yt-dlp download")?;

    if !status.success() {
        return Err(DownloadError::CommandStatus {
            tool: "yt-dlp",
            code: status.code(),
        }
        .into());
    }
```

Counterexample already in the codebase:

```rust
// crates/videocut-download/src/lib.rs:123
let output = Command::new("yt-dlp")
    // args omitted
    .output()
    .context("run yt-dlp metadata")?;

if !output.status.success() {
    return Err(DownloadError::CommandOutput {
        tool: "yt-dlp",
        code: output.status.code(),
        stderr: stderr_text(&output.stderr),
    }
    .into());
}
```

Recommendation: standardize command wrappers around `.output()` and include trimmed stderr in every non-zero status error.

### P1-3: Helper script packaging/path assumptions currently break tests and can break runtime

Category: error handling, operational reliability

Impact: `videocut-align` requires `python/align_ffa.py` to exist in the source-tree or executable ancestor layout unless `VIDEOCUT_ALIGN_SCRIPT` is set. In this worktree, no `python/align_ffa.py` or `python/whisper_transcribe.py` exists; only `crates/nf-tts/scripts/align_ffa.py` was found. The scoped test run fails before the full package test set can complete. The same path-resolution branch is used by production `align`.

Evidence:

```rust
// crates/videocut-align/src/script.rs:68
let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
let source_tree = manifest
    .parent()
    .and_then(Path::parent)
    .map(|root| root.join("python/align_ffa.py"))
    .filter(|path| path.exists());
if let Some(path) = source_tree {
    return Ok(path);
}

let exe = std::env::current_exe().context("resolve current executable")?;
for parent in exe.ancestors() {
    let candidate = parent.join("python/align_ffa.py");
    if candidate.exists() {
        return Ok(candidate);
    }
}

bail!("python/align_ffa.py not found (set VIDEOCUT_ALIGN_SCRIPT)")
```

Observed failure:

```text
test tests::align_script_resolves_from_source_tree ... FAILED
Error: python/align_ffa.py not found (set VIDEOCUT_ALIGN_SCRIPT)
```

Recommendation: make helper-script packaging explicit in the crate or test fixture, or gate path-resolution tests on a fixture/env override.

## P2

### P2-1: Whisper script error hint names the wrong environment variable

Category: error handling, diagnostics

Impact: the resolver checks `VIDEOCUT_WHISPER_SCRIPT`, but the final error tells operators to set `SPLICE_WHISPER_SCRIPT`. If the script is missing, the remediation hint points to an env var that this code does not read.

Evidence:

```rust
// crates/videocut-transcribe/src/lib.rs:281
fn whisper_script_path() -> Result<PathBuf> {
    if let Ok(path) = std::env::var("VIDEOCUT_WHISPER_SCRIPT") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    // ...
    bail!("python/whisper_transcribe.py not found (set SPLICE_WHISPER_SCRIPT)")
}
```

Recommendation: make the error hint match `VIDEOCUT_WHISPER_SCRIPT`.

### P2-2: Transcription file logger silently drops lock, write, and flush errors

Category: thread safety, diagnostics

Impact: `Logger` is thread-safe enough for rayon logging because it wraps `File` in `Mutex<File>`, but it deliberately ignores mutex poisoning and I/O failures. During long parallel transcribes this can leave only partial `log.txt` without surfacing the loss to the caller.

Evidence:

```rust
// crates/videocut-transcribe/src/logger.rs:29
pub fn log(&self, message: &str) {
    let line = format!("[{}] {}", hhmmss(), message);
    eprintln!("{line}");
    if let Ok(mut file) = self.file.lock() {
        let _ = writeln!(file, "{line}");
        let _ = file.flush();
    }
}
```

Recommendation: return `Result<()>` from file logging or at least emit a stderr warning when the lock/write/flush fails.

### P2-3: Parallel transcribe does not fail fast on chunk errors

Category: thread safety, `Result` propagation

Impact: rayon execution is deterministic enough after sorting by index, and no data race was found. However, failures are collected as `Vec<Result<_>>`; the first error is returned only after all currently scheduled chunks finish. On expensive Whisper jobs this can burn substantial compute after an early fatal condition such as a missing model or broken Python environment.

Evidence:

```rust
// crates/videocut-transcribe/src/lib.rs:173
let mut ordered = pool.install(|| {
    chunks
        .par_iter()
        .enumerate()
        .map(|(index, chunk)| {
            logger.log(&format!(
                "chunk {}/{} start offset={:.2}s duration={:.2}s",
                index + 1,
                chunks.len(),
                chunk.offset_sec,
                chunk.duration_sec
            ));
            run_whisper_script(&chunk.path, model, language)
                .map(|output| (index, chunk.offset_sec, output))
                .with_context(|| format!("transcribe chunk {}", index + 1))
        })
        .collect::<Vec<_>>()
});

let mut completed = Vec::with_capacity(ordered.len());
for result in ordered.drain(..) {
    completed.push(result?);
}
```

Recommendation: use a fallible parallel collection pattern or cooperative cancellation if fail-fast behavior is desired for infrastructure errors.

### P2-4: Lint deny coverage depends on running clippy

Category: panic/unwrap/expect lint enforcement

Impact: the six denies are configured under `[workspace.lints.clippy]`, so enforcement happens in `cargo clippy`. A plain `cargo check`, `cargo build`, or `cargo test` does not by itself enforce these clippy lints. The scoped production code currently passes clippy, but CI must include clippy for the policy to be meaningful.

Evidence:

```toml
# Cargo.toml:28
[workspace.lints.clippy]
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
unreachable = "deny"
todo = "deny"
wildcard_imports = "deny"
```

Recommendation: ensure the clips CI gate includes the same scoped clippy command, or a workspace clippy job, before merge.

## Category Notes

### Panic / unwrap / expect

No production direct `panic!`, `unwrap()`, or `expect()` was found in the reviewed crates. The clippy deny gate passed for the scoped packages.

### Error Handling / Result Propagation

Most top-level paths use `anyhow::Result` with `.context()` / `.with_context()`, which is consistent and readable. The main weaknesses are batch cut failures not affecting process success, and non-zero external process exits losing stderr in several critical paths.

### Thread Safety

No shared mutable unsynchronized state was found in production code. The parallel transcription path uses rayon plus a mutex-protected file logger. The logger is safe from data races, but it drops write failures silently.

### FFI

No FFI surface or production `unsafe` block was found in the reviewed crates. The only scoped `unsafe` hits are tests that serialize environment mutation with a mutex:

```rust
// crates/videocut-core/src/python.rs:38
unsafe {
    std::env::set_var("VIDEOCUT_CORE_TEST_PYTHON_BIN", "custom-python");
}
// ...
unsafe {
    std::env::remove_var("VIDEOCUT_CORE_TEST_PYTHON_BIN");
}
```

### Async Calls

No async runtime, `.await`, `tokio::spawn`, `block_on`, or custom async bridge was found in the reviewed crates. The pipeline is synchronous and process-bound.
