use serde_json::json;

use crate::commands::{send_ipc, LogCommand, LogSubcommand};
use crate::errors::NfError;

pub fn dispatch(args: LogCommand) -> Result<(), NfError> {
    match args.command {
        LogSubcommand::Tail(args) => send_ipc(
            "log-tail",
            json!({
                "project": args.project,
                "episode": args.episode,
                "limit": args.limit,
                "actor": args.actor,
                "since": args.since
            }),
        ),
        LogSubcommand::Show(args) => send_ipc(
            "log-show",
            json!({"project": args.project, "episode": args.episode, "id": args.id}),
        ),
        LogSubcommand::Create(args) => send_ipc(
            "log-create",
            json!({
                "project": args.project,
                "episode": args.episode,
                "actor": args.actor,
                "desc": args.desc,
                "cli": args.cli,
                "status": args.status
            }),
        ),
    }
}
