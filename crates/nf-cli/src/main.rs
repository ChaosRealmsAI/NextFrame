use std::process::ExitCode;

use clap::Parser;
use nf_cli::commands::{self, Cli, Command};
use nf_cli::errors::NfError;

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
        Command::Capture(args) => commands::app::capture(args),
        Command::Karaoke(args) => commands::karaoke::run(&args.episode_dir),
        Command::Export(args) => commands::export_cmd::run(args),
        Command::Verify(args) => commands::verify::run(args),
        Command::ExportStatus(args) => commands::send_ipc(
            "export.status",
            serde_json::json!({ "job_id": args.job_id }),
        ),
        Command::ExportCancel(args) => commands::send_ipc(
            "export.cancel",
            serde_json::json!({ "job_id": args.job_id }),
        ),
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
        Command::Composition(args) => commands::compositions::dispatch(args),
        Command::Anchors(args) => commands::anchors::dispatch(args),
        Command::Log(args) => commands::log::dispatch(args),
        Command::Help(args) => commands::utility::help(args),
        Command::Doctor(args) => commands::doctor::run(args),
        Command::Version => commands::utility::version(),
    }
}
