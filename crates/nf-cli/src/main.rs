//! nf — NextFrame CLI entry
//!
//! v0.3.0: Karaoke subcommand 迁自 v1.13.1 nf karaoke · clips pipeline 终点.
//! 更多子命令留 v0.4+.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

mod commands;
mod error;
mod io_json;

#[derive(Parser)]
#[command(name = "nf", version, about = "NextFrame CLI")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Generate <episode>/clips/index.html · bilingual word-level karaoke player.
    ///
    /// Reads: sources/<slug>/words.json + clips/cut_report.json + clips/clip_NN.translations.*.json
    /// Writes: <episode>/clips/index.html (self-contained · data inline · file:// safe)
    Karaoke {
        /// Episode directory (must contain sources/ and clips/)
        episode_dir: PathBuf,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let result = match cli.command {
        Command::Karaoke { episode_dir } => commands::karaoke::run(&episode_dir),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            io_json::emit_error(&e);
            ExitCode::from(e.exit_code())
        }
    }
}
