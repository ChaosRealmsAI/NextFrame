mod commands;
mod errors;
mod ipc_client;

use std::process::ExitCode;

use clap::Parser;
use commands::{Cli, Command};
use errors::NfError;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            err.write_stderr();
            ExitCode::from(err.exit_code())
        }
    }
}

fn run() -> Result<(), NfError> {
    let cli = Cli::parse();
    match cli.command {
        Command::Open(args) => commands::app::open(args),
        Command::Ps(args) => commands::app::ps(args),
        Command::Screenshot(args) => commands::app::screenshot(args),
        Command::Click(args) => commands::app::click(args),
        Command::Select(args) => commands::app::select(args),
        Command::Tab(args) => commands::app::tab(args),
        Command::State(args) => commands::app::state(args),
        Command::Devtools(args) => commands::app::devtools(args),
        Command::Close(args) => commands::app::close(args),
        Command::Quit => commands::app::quit(),
        Command::Projects(args) => commands::projects::dispatch(args),
        Command::Episodes(args) => commands::episodes::dispatch(args),
        Command::Clips(args) => commands::clips::dispatch(args),
        Command::Anchors(args) => commands::anchors::dispatch(args),
        Command::Log(args) => commands::log::dispatch(args),
        Command::Help(args) => commands::utility::help(args),
        Command::Doctor(args) => commands::utility::doctor(args),
        Command::Version => commands::utility::version(),
    }
}
