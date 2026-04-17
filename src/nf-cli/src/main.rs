//! nf — NextFrame CLI. JSON-only output. Never free-form text.

use clap::{Parser, Subcommand};

mod commands;

#[derive(Parser, Debug)]
#[command(name = "nf", version, about = "NextFrame CLI (v2.0 walking skeleton)")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Compile source.json → bundle.html via the TypeScript engine.
    Build {
        source: std::path::PathBuf,
        #[arg(short, long)]
        output: std::path::PathBuf,
    },
    /// Render bundle.html → MP4 via nf-recorder.
    Record {
        #[arg(long, default_value = "spec/fixtures/sample.json")]
        bundle: std::path::PathBuf,
        #[arg(short = 'o', long = "out", default_value = "out/record.mp4")]
        out: std::path::PathBuf,
        #[arg(long, default_value_t = 1.0)]
        duration: f64,
        #[arg(long, default_value_t = 30)]
        fps: u32,
        #[arg(long, default_value = "1920x1080")]
        resolution: String,
        #[arg(long, default_value_t = 6)]
        workers: usize,
        #[arg(long)]
        verify_pixels: bool,
        #[arg(long)]
        dry_run: bool,
    },
    /// Validate a source.json (anchors / viewport / refs).
    Validate { source: std::path::PathBuf },
    /// AI-ops introspection. Emits JSON on stdout.
    AiOps {
        #[command(subcommand)]
        action: commands::AiOpsCmd,
    },
}

fn main() {
    let cli = Cli::parse();
    let result: anyhow::Result<commands::CommandOutput> = match cli.command {
        Command::Build { source, output } => {
            commands::build::run(&source, &output).map(commands::CommandOutput::json)
        }
        Command::Record {
            bundle,
            out,
            duration,
            fps,
            resolution,
            workers,
            verify_pixels,
            dry_run,
        } => commands::record::run(commands::record::RecordOptions {
            bundle,
            out,
            duration_s: duration,
            fps,
            resolution,
            workers,
            verify_pixels,
            dry_run,
        }),
        Command::Validate { source } => commands::validate::run(&source),
        Command::AiOps { action } => commands::ai_ops::run(action),
    };
    match result {
        Ok(output) => {
            let exit_code = output.exit_code;
            if let Some(value) = output.value {
                if let Ok(s) = serde_json::to_string(&value) {
                    println!("{}", s);
                }
            }
            if exit_code != 0 {
                std::process::exit(exit_code);
            }
        }
        Err(err) => {
            let payload = serde_json::json!({
                "ok": false,
                "error": err.to_string(),
            });
            if let Ok(s) = serde_json::to_string(&payload) {
                eprintln!("{}", s);
            }
            std::process::exit(1);
        }
    }
}
