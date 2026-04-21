use crate::commands::{w2_stub, ProjectCommand, ProjectSubcommand};
use crate::errors::NfError;

pub fn dispatch(args: ProjectCommand) -> Result<(), NfError> {
    match args.command {
        ProjectSubcommand::List => w2_stub("projects list"),
        ProjectSubcommand::Episodes(_) => w2_stub("projects episodes"),
        ProjectSubcommand::Clips(_) => w2_stub("projects clips"),
        ProjectSubcommand::Show(_) => w2_stub("projects show"),
        ProjectSubcommand::Create(_) => w2_stub("projects create"),
        ProjectSubcommand::Rename(_) => w2_stub("projects rename"),
        ProjectSubcommand::Archive(_) => w2_stub("projects archive"),
        ProjectSubcommand::Delete(_) => w2_stub("projects delete"),
    }
}
