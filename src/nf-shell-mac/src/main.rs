use std::path::PathBuf;

use clap::Parser;

use nf_shell_mac::window::{ShellOptions, run_shell};

#[derive(Debug, Parser)]
#[command(name = "nf-shell-mac", version, about = "NextFrame macOS shell")]
struct Cli {
    #[arg(long, default_value = "spec/fixtures/sample.json")]
    source: PathBuf,
    #[arg(long)]
    screenshot: Option<PathBuf>,
    #[arg(long)]
    eval_script: Option<String>,
}

fn main() {
    let cli = Cli::parse();
    let result = run_shell(ShellOptions {
        source_path: cli.source,
        screenshot_out: cli.screenshot,
        eval_script: cli.eval_script,
    });

    if let Err(err) = result {
        eprintln!(
            "{}",
            serde_json::json!({
                "ok": false,
                "crate": "nf-shell-mac",
                "error": err.to_string(),
            })
        );
        std::process::exit(1);
    }
}
