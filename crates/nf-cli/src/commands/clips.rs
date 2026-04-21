use crate::commands::{w2_stub, ClipCommand, ClipSubcommand};
use crate::errors::NfError;

pub fn dispatch(args: ClipCommand) -> Result<(), NfError> {
    match args.command {
        ClipSubcommand::List(_) => w2_stub("clips list"),
        ClipSubcommand::Show(_) => w2_stub("clips show"),
        ClipSubcommand::Create(_) => w2_stub("clips create"),
        ClipSubcommand::Update(_) => w2_stub("clips update"),
        ClipSubcommand::Delete(_) => w2_stub("clips delete"),
    }
}
