//! CLI entrypoint for the nf-source pipeline tool.
mod cli;
mod cmd_align;
mod cmd_cut;
mod cmd_download;
mod cmd_preview;
mod cmd_transcribe;
mod output;

use anyhow::Result;
use clap::Parser;

use crate::cli::{Cli, Command};

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::Download(args) => cmd_download::run(args),
        Command::Transcribe(args) => cmd_transcribe::run(args),
        Command::Align(args) => cmd_align::run(args),
        Command::Cut(args) => cmd_cut::run(args),
        Command::Preview(args) => cmd_preview::run(args),
    }
}
