use clap::{Args, Subcommand};

#[derive(Subcommand, Debug, Clone)]
pub enum AiOpsCmd {
    /// Start the local AI-operable HTTP server.
    Serve(ServeArgs),
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

#[derive(Args, Debug, Clone)]
pub struct ServeArgs {
    #[arg(long, default_value = "127.0.0.1")]
    pub bind: std::net::IpAddr,
    #[arg(long, default_value_t = 0)]
    pub port: u16,
}
