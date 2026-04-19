//! CLI parser for `nf-recorder` · v1.14 T-09 / T-18 subcommand refactor.
//!
//! Contract source: `spec/versions/v1.14/spec/interfaces-delta.json`
//! → `additions.modules[nf-recorder].subprocess_protocol`.
//!
//! ## Invocation shapes (backward-compatible)
//!
//! 1. **Legacy record** (no subcommand · T-09 original)
//!    ```bash
//!    nf-recorder <bundle> -o out.mp4 --res 1080p --fps 60 --bitrate 12M --max-duration 60
//!    ```
//!    Still works · dispatcher falls through to `record_loop::run`.
//!
//! 2. **Snapshot** (T-18 · product-internal pixel sampling)
//!    ```bash
//!    nf-recorder snapshot <bundle> --t-ms 2500 -o frame.png [--viewport 1920x1080]
//!    ```
//!    Writes a single PNG via the same CARenderer / IOSurface path as record.
//!
//! T-17 will append `Verify { ... }` to `Command` when it lands · the enum is
//! deliberately non-exhaustive upstream logic so adding a variant is additive.

use clap::{Parser, Subcommand};
use std::path::PathBuf;

use crate::record_loop::RecordConfig;

/// v1.14 `nf-recorder` command-line interface.
///
/// The top-level struct doubles as the legacy record invocation (no
/// subcommand); `command` is an optional subcommand that takes precedence
/// when present. This keeps `nf-recorder <bundle> -o out.mp4` working.
#[derive(Parser, Debug)]
#[command(
    name = "nf-recorder",
    version,
    about = "Record bundle.html to MP4 · snapshot single frame to PNG (v1.14)"
)]
pub struct Cli {
    /// Optional subcommand (snapshot / future verify). Absent = legacy record.
    #[command(subcommand)]
    pub command: Option<Command>,

    /// Path to bundle.html (legacy record invocation).
    #[arg(required = false)]
    pub bundle: Option<PathBuf>,

    /// Output MP4 path (legacy record invocation).
    #[arg(short = 'o', long = "output", required = false)]
    pub output: Option<PathBuf>,

    /// Resolution · v1.14 only supports `1080p` (4K in v1.24+).
    #[arg(long, default_value = "1080p")]
    pub res: String,

    /// Frame rate · must be 30 or 60.
    #[arg(long, default_value_t = 60)]
    pub fps: u32,

    /// Bitrate · accept `12M` / `500K` / raw bps like `12000000`.
    #[arg(long, default_value = "12M")]
    pub bitrate: String,

    /// Hard cap on recording duration in seconds.
    #[arg(long = "max-duration", default_value_t = 60)]
    pub max_duration: u32,

    /// v1.15 · 时间切片并行录制 · 父进程启 N 个子进程各录 1/N 段 · ffmpeg concat 合并。
    /// 1 = 单进程（默认 · 兼容 v1.14）· ≥2 = 并行。N≥2 但视频 duration<6s 自动退化单进程。
    #[arg(long = "parallel", default_value_t = 1)]
    pub parallel: usize,

    /// v1.15 · 子进程内部参数 · 父 orchestrator 调子进程时传 · 用户不用设（hidden）。
    /// 格式 `<start_frame>,<end_frame>` · 半开区间 [start, end) · 0-indexed。
    #[arg(long = "frame-range", hide = true)]
    pub frame_range: Option<String>,
}

/// Subcommands · T-18 adds `Snapshot` · T-17 adds `Verify`.
#[derive(Subcommand, Debug)]
pub enum Command {
    /// Snapshot a single frame at `t_ms` · writes PNG via same CARenderer path
    /// as record (VP-4 pixel-diff relies on identical pixel provenance).
    Snapshot {
        /// Path to bundle.html.
        bundle: PathBuf,
        /// Time `t` in milliseconds.
        #[arg(long = "t-ms")]
        t_ms: u64,
        /// Output PNG path.
        #[arg(short = 'o', long = "output")]
        output: PathBuf,
        /// Viewport `<W>x<H>` · default 1920x1080.
        #[arg(long, default_value = "1920x1080")]
        viewport: String,
    },

    /// Verify an MP4 file with 6 built-in assertions · pure-Rust atom parse ·
    /// no external tool needed (self-verification rule · product-internal).
    Verify {
        /// Path to MP4 file to verify.
        file: PathBuf,

        /// Expected frame rate · tolerance ± 0.1% (default 60).
        #[arg(long = "expect-fps", default_value_t = 60)]
        expect_fps: u32,

        /// Expected bitrate in bps · tolerance ± 15% · skipped if absent.
        #[arg(long = "expect-bitrate")]
        expect_bitrate: Option<u32>,

        /// Reserved · default output is already JSON-Line on stdout.
        #[arg(long)]
        json: bool,
    },
}

/// Parse argv via clap · exits the process on parse failure (user error).
pub fn parse() -> Cli {
    Cli::parse()
}

/// Convert a parsed (legacy record) `Cli` into a validated `RecordConfig`.
///
/// Fails if `command` is set (caller should dispatch on subcommand instead)
/// or if mandatory legacy flags are missing.
///
/// Performs contract validation:
/// - `bundle` exists on disk
/// - `--res` ∈ {`1080p`}
/// - `--fps` ∈ {30, 60}
/// - `--bitrate` parses to a positive u32 bps
pub fn to_config(cli: &Cli) -> Result<RecordConfig, String> {
    let bundle = cli
        .bundle
        .as_ref()
        .ok_or_else(|| "record: missing <bundle> (positional)".to_string())?;
    let output = cli
        .output
        .as_ref()
        .ok_or_else(|| "record: missing -o/--output".to_string())?;

    if !bundle.exists() {
        return Err(format!("bundle does not exist: {}", bundle.display()));
    }

    let (width, height) = match cli.res.as_str() {
        "1080p" => (1920u32, 1080u32),
        other => {
            return Err(format!(
                "--res {other} not supported in v1.14 (only 1080p)"
            ));
        }
    };

    if !(cli.fps == 30 || cli.fps == 60) {
        return Err(format!("--fps must be 30 or 60 (got {})", cli.fps));
    }

    let bitrate_bps = parse_bitrate(&cli.bitrate)?;
    if bitrate_bps == 0 {
        return Err("--bitrate must be > 0".into());
    }

    let frame_range = match cli.frame_range.as_ref() {
        None => None,
        Some(s) => Some(parse_frame_range(s)?),
    };

    Ok(RecordConfig {
        bundle: bundle.clone(),
        output: output.clone(),
        width,
        height,
        fps: cli.fps,
        bitrate_bps,
        max_duration_s: cli.max_duration,
        frame_range,
    })
}

/// Parse `<start>,<end>` frame-range · half-open `[start, end)`.
/// v1.15 · orchestrator 内部 spawn 子进程时传。
pub fn parse_frame_range(s: &str) -> Result<(u64, u64), String> {
    let trimmed = s.trim();
    let parts: Vec<&str> = trimmed.splitn(2, ',').collect();
    if parts.len() != 2 {
        return Err(format!("frame-range: expected <start>,<end>, got '{trimmed}'"));
    }
    let start: u64 = parts[0]
        .trim()
        .parse()
        .map_err(|e: std::num::ParseIntError| format!("frame-range start: {e}"))?;
    let end: u64 = parts[1]
        .trim()
        .parse()
        .map_err(|e: std::num::ParseIntError| format!("frame-range end: {e}"))?;
    if end <= start {
        return Err(format!("frame-range: end ({end}) must be > start ({start})"));
    }
    Ok((start, end))
}

/// Parse bitrate strings of form `12M` / `500K` / `12000000`.
///
/// Public so T-10 tests can cover it directly.
pub fn parse_bitrate(s: &str) -> Result<u32, String> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Err("bitrate: empty string".into());
    }
    if let Some(num) = trimmed
        .strip_suffix('M')
        .or_else(|| trimmed.strip_suffix('m'))
    {
        let v: f64 = num
            .parse()
            .map_err(|e: std::num::ParseFloatError| format!("bitrate: {e}"))?;
        let scaled = (v * 1_000_000.0).round();
        if !(0.0..=f64::from(u32::MAX)).contains(&scaled) {
            return Err(format!("bitrate out of u32 range: {s}"));
        }
        return Ok(scaled as u32);
    }
    if let Some(num) = trimmed
        .strip_suffix('K')
        .or_else(|| trimmed.strip_suffix('k'))
    {
        let v: f64 = num
            .parse()
            .map_err(|e: std::num::ParseFloatError| format!("bitrate: {e}"))?;
        let scaled = (v * 1_000.0).round();
        if !(0.0..=f64::from(u32::MAX)).contains(&scaled) {
            return Err(format!("bitrate out of u32 range: {s}"));
        }
        return Ok(scaled as u32);
    }
    trimmed
        .parse::<u32>()
        .map_err(|e: std::num::ParseIntError| format!("bitrate: {e}"))
}

/// Parse `<W>x<H>` / `<W>X<H>` viewport · returns `(width, height)`.
///
/// Used by `Command::Snapshot` to turn `--viewport 1920x1080` into explicit
/// dimensions. Rejects zero / overflow.
pub fn parse_viewport(s: &str) -> Result<(u32, u32), String> {
    let trimmed = s.trim();
    let parts: Vec<&str> = trimmed.splitn(2, |c| c == 'x' || c == 'X').collect();
    if parts.len() != 2 {
        return Err(format!("viewport: expected <W>x<H>, got '{trimmed}'"));
    }
    let w: u32 = parts[0]
        .parse()
        .map_err(|e: std::num::ParseIntError| format!("viewport width: {e}"))?;
    let h: u32 = parts[1]
        .parse()
        .map_err(|e: std::num::ParseIntError| format!("viewport height: {e}"))?;
    if w == 0 || h == 0 {
        return Err(format!("viewport must be > 0x0 (got {w}x{h})"));
    }
    Ok((w, h))
}
