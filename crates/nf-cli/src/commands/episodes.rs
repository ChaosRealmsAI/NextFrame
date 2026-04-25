use serde_json::json;

use crate::commands::{send_ipc, EpisodeCommand, EpisodeSubcommand};
use crate::errors::NfError;

pub fn dispatch(args: EpisodeCommand) -> Result<(), NfError> {
    match args.command {
        EpisodeSubcommand::List(args) => {
            send_ipc("episodes-list", json!({"project": args.project}))
        }
        EpisodeSubcommand::Show(args) => send_ipc(
            "episodes-show",
            json!({"project": args.project, "episode": args.episode}),
        ),
        EpisodeSubcommand::Create(args) => send_ipc(
            "episodes-create",
            json!({
                "project": args.project,
                "slug": args.slug,
                "name": args.name.unwrap_or_else(|| args.slug.clone()),
                "duration": args.duration
            }),
        ),
        EpisodeSubcommand::Rename(args) => send_ipc(
            "episodes-rename",
            json!({"project": args.project, "episode": args.episode, "name": args.name}),
        ),
        EpisodeSubcommand::Archive(args) => send_ipc(
            "episodes-archive",
            json!({"project": args.project, "episode": args.episode}),
        ),
        EpisodeSubcommand::Delete(args) => send_ipc(
            "episodes-delete",
            json!({"project": args.project, "episode": args.episode, "confirm": args.confirm}),
        ),
    }
}
