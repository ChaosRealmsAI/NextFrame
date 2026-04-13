mod backend;
mod cache;
mod cli;
mod config;
mod lang;
mod output;
mod queue;
mod whisper;

use anyhow::Result;
use clap::Parser;
use cli::Cli;

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    cli::run(cli).await
}
