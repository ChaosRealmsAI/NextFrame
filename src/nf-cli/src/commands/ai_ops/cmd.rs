use clap::Subcommand;

#[derive(Subcommand, Debug, Clone)]
pub enum AiOpsCmd {
    /// List actions the CLI exposes (machine-readable).
    Describe,
    /// Simulate running an action without side effects.
    Simulate {
        #[arg(long)]
        action: String,
    },
    /// Dump current runtime state (stub).
    State,
    /// Take a screenshot of the current shell window (stub path).
    Screenshot {
        #[arg(short, long, default_value = "tmp/nf-screenshot.png")]
        output: std::path::PathBuf,
    },
}
