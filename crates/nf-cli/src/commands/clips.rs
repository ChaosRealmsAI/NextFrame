use serde_json::json;

use crate::commands::{ClipCommand, ClipSubcommand, send_ipc};
use crate::errors::NfError;

pub fn dispatch(args: ClipCommand) -> Result<(), NfError> {
    match args.command {
        ClipSubcommand::List(args) => send_ipc(
            "clips-list",
            json!({"project": args.project, "episode": args.episode, "track": args.track}),
        ),
        ClipSubcommand::Show(args) => send_ipc(
            "clips-show",
            json!({"project": args.project, "episode": args.episode, "clip": args.clip}),
        ),
        ClipSubcommand::Create(args) => send_ipc(
            "clips-create",
            json!({
                "project": args.project,
                "episode": args.episode,
                "slug": args.slug,
                "label": args.label,
                "track": args.track,
                "start": args.start,
                "end": args.end,
                "effects": args.effects.map(split_csv)
            }),
        ),
        ClipSubcommand::Update(args) => send_ipc(
            "clips-update",
            json!({
                "project": args.project,
                "episode": args.episode,
                "clip": args.clip,
                "start": args.start,
                "end": args.end,
                "label": args.label,
                "effects": args.effects.map(split_csv)
            }),
        ),
        ClipSubcommand::Delete(args) => send_ipc(
            "clips-delete",
            json!({"project": args.project, "episode": args.episode, "clip": args.clip, "confirm": args.confirm}),
        ),
    }
}

fn split_csv(raw: String) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect()
}
