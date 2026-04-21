use crate::commands::{w2_stub, LogCommand, LogSubcommand};
use crate::errors::NfError;

pub fn dispatch(args: LogCommand) -> Result<(), NfError> {
    match args.command {
        LogSubcommand::Tail(_) => w2_stub("log tail"),
        LogSubcommand::Show(_) => w2_stub("log show"),
        LogSubcommand::Create(_) => w2_stub("log create"),
    }
}
