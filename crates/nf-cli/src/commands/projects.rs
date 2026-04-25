use serde_json::json;

use crate::commands::{ProjectCommand, ProjectSubcommand, send_ipc};
use crate::errors::NfError;

pub fn dispatch(args: ProjectCommand) -> Result<(), NfError> {
    match args.command {
        ProjectSubcommand::List => send_ipc("projects-list", json!({})),
        ProjectSubcommand::Episodes(args) => {
            send_ipc("projects-episodes", json!({"project": args.project}))
        }
        ProjectSubcommand::Clips(args) => send_ipc(
            "projects-clips",
            json!({"project": args.project, "episode": args.episode}),
        ),
        ProjectSubcommand::Show(args) => {
            send_ipc("projects-show", json!({"project": args.project}))
        }
        ProjectSubcommand::Create(args) => send_ipc(
            "projects-create",
            json!({
                "slug": args.slug,
                "name": args.name,
                "description": args.description,
                "tags": args.tags.map(|raw| {
                    raw.split(',')
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                })
            }),
        ),
        ProjectSubcommand::Rename(args) => send_ipc(
            "projects-rename",
            json!({"project": args.project, "name": args.name}),
        ),
        ProjectSubcommand::Archive(args) => {
            send_ipc("projects-archive", json!({"project": args.project}))
        }
        ProjectSubcommand::Delete(args) => send_ipc(
            "projects-delete",
            json!({"project": args.project, "confirm": args.confirm}),
        ),
    }
}
