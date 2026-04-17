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
        bundle: std::path::PathBuf,
        #[arg(short, long)]
        output: std::path::PathBuf,
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
    let result: anyhow::Result<Option<serde_json::Value>> = match cli.command {
        Command::Build { source, output } => commands::build::run(&source, &output).map(Some),
        Command::Record { bundle, output } => commands::record::run(&bundle, &output).map(Some),
        Command::Validate { source } => commands::validate::run(&source).map(Some),
        Command::AiOps { action } => commands::ai_ops::run(action),
    };
    match result {
        Ok(Some(value)) => {
            if let Ok(s) = serde_json::to_string(&value) {
                println!("{}", s);
            }
        }
        Ok(None) => {}
        Err(err) => {
            let payload = serde_json::json!({
                "ok": false,
                "error": err.to_string(),
            });
            eprintln!("{}", payload);
            std::process::exit(1);
        }
    }
}
