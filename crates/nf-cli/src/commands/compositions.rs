use serde_json::{Value, json};

use crate::commands::{CompositionCommand, CompositionSubcommand, send_ipc};
use crate::errors::NfError;

pub fn dispatch(args: CompositionCommand) -> Result<(), NfError> {
    match args.command {
        CompositionSubcommand::Show(args) => send_ipc(
            "compositions-show",
            json!({
                "project": args.project,
                "composition": args.composition,
                "track": args.track,
                "field": args.field
            }),
        ),
        CompositionSubcommand::Patch(args) => send_ipc(
            "compositions-update-track",
            json!({
                "project": args.project,
                "composition": args.composition,
                "track": args.track,
                "field": args.field,
                "value": parse_value(&args.value)
            }),
        ),
    }
}

fn parse_value(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}
