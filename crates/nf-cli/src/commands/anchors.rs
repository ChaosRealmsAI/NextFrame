use crate::commands::{w2_stub, AnchorCommand, AnchorSubcommand};
use crate::errors::NfError;

pub fn dispatch(args: AnchorCommand) -> Result<(), NfError> {
    match args.command {
        AnchorSubcommand::List(_) => w2_stub("anchors list"),
        AnchorSubcommand::Set(_) => w2_stub("anchors set"),
        AnchorSubcommand::Unset(_) => w2_stub("anchors unset"),
    }
}
