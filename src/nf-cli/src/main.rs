//! nf-cli — NextFrame command-line interface.
//!
//! Rust 6-subcommand wrapper that spawns the TypeScript engine subprocess
//! (`src/nf-core-engine/dist/engine.js`) for most work and delegates track
//! linting directly to the Node ABI checker (`src/nf-tracks/scripts/check-abi.mjs`).
//!
//! stdout is JSON-only (rule-ai-operable). Every code path emits either a
//! success envelope `{"ok":true,"data":...}` or an error envelope
//! `{"ok":false,"error":{...}}`. exit code 0 = success, non-zero = failure.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

mod commands;
mod engine;
mod error;
mod io_json;

#[derive(Parser, Debug)]
#[command(
    name = "nf",
    about = "NextFrame CLI — JSON in, video (HTML) out.",
    version,
    disable_help_subcommand = true
)]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Compile source.json to single-file bundle.html.
    Build {
        /// Path to timeline source JSON.
        source: PathBuf,
        /// Output bundle.html path.
        #[arg(short, long)]
        out: PathBuf,
        /// Pretty-print inlined resolved JSON (debug).
        #[arg(long, default_value_t = false)]
        pretty: bool,
    },
    /// Static-check source.json (schema + anchors + expr + track ABI refs).
    Validate {
        /// Path to timeline source JSON.
        source: PathBuf,
    },
    /// List or rename anchors inside source.json.
    Anchors {
        /// Path to timeline source JSON.
        source: PathBuf,
        /// Rename anchor ("old=new"). Without --write prints patched JSON to stdout.
        #[arg(long)]
        rename: Option<String>,
        /// With --rename: write patched JSON back into source.
        #[arg(long, default_value_t = false)]
        write: bool,
    },
    /// Static-check a single Track .js file against ABI (zero-import / exports / FM-T0).
    #[command(name = "lint-track")]
    LintTrack {
        /// Path to Track .js.
        file: PathBuf,
    },
    /// Print the JSON Schema of a Track's params (track id or path to .js).
    Schema {
        /// Track id (e.g. "scene") OR path to .js file.
        track: String,
    },
    /// Scaffold a minimal empty timeline source.json.
    New {
        /// Output path (default ./timeline.json).
        #[arg(short, long)]
        out: Option<PathBuf>,
        /// Viewport ratio (16:9 | 9:16 | 1:1).
        #[arg(long, default_value = "16:9")]
        ratio: String,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();

    let result = match cli.cmd {
        Command::Build {
            source,
            out,
            pretty,
        } => commands::build::run(&source, &out, pretty),
        Command::Validate { source } => commands::validate::run(&source),
        Command::Anchors {
            source,
            rename,
            write,
        } => commands::anchors::run(&source, rename.as_deref(), write),
        Command::LintTrack { file } => commands::lint_track::run(&file),
        Command::Schema { track } => commands::schema::run(&track),
        Command::New { out, ratio } => commands::new_cmd::run(out.as_deref(), &ratio),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            io_json::emit_error(&e);
            ExitCode::from(e.exit_code())
        }
    }
}
