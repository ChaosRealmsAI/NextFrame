use crate::commands::{w2_stub, EpisodeCommand, EpisodeSubcommand};
use crate::errors::NfError;

pub fn dispatch(args: EpisodeCommand) -> Result<(), NfError> {
    match args.command {
        EpisodeSubcommand::List(_) => w2_stub("episodes list"),
        EpisodeSubcommand::Show(_) => w2_stub("episodes show"),
        EpisodeSubcommand::Create(_) => w2_stub("episodes create"),
        EpisodeSubcommand::Rename(_) => w2_stub("episodes rename"),
        EpisodeSubcommand::Archive(_) => w2_stub("episodes archive"),
        EpisodeSubcommand::Delete(_) => w2_stub("episodes delete"),
    }
}
