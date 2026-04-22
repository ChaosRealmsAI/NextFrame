use serde_json::json;

use crate::commands::{AnchorCommand, AnchorSubcommand, send_ipc};
use crate::errors::NfError;

pub fn dispatch(args: AnchorCommand) -> Result<(), NfError> {
    match args.command {
        AnchorSubcommand::List(args) => send_ipc(
            "anchors-list",
            json!({"project": args.project, "episode": args.episode}),
        ),
        AnchorSubcommand::Set(args) => send_ipc(
            "anchors-set",
            json!({"project": args.project, "episode": args.episode, "name": args.name, "time": args.time}),
        ),
        AnchorSubcommand::Unset(args) => send_ipc(
            "anchors-unset",
            json!({"project": args.project, "episode": args.episode, "name": args.name}),
        ),
    }
}
