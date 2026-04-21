use std::process::ExitCode;
use std::sync::Arc;

use nf_shell::handlers::ComposeOpHandler;
use nf_shell::ipc_server::{serve_handler, socket_path};

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("{}", err.to_record().detail);
            ExitCode::from(err.exit_code())
        }
    }
}

fn run() -> Result<(), nf_shell::errors::NfError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|err| nf_shell::errors::NfError::SocketFailed(err.to_string()))?;
    let handler = Arc::new(ComposeOpHandler::from_default_storage()?);
    runtime.block_on(serve_handler(socket_path(), handler))
}
