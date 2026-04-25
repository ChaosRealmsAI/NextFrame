use nf_project::{JsonStorage, Storage, validate_composition_components};
use serde_json::{Value, json};

use crate::commands::{CompositionCommand, CompositionSubcommand, print_json, send_ipc};
use crate::errors::NfError;

pub fn dispatch(args: CompositionCommand) -> Result<(), NfError> {
    match args.command {
        CompositionSubcommand::Show(args) => send_ipc(
            "compositions-show",
            json!({
                "project": args.project,
                "composition": args.composition,
                "clip": args.clip,
                "track": args.track,
                "item": args.item,
                "field": args.field
            }),
        ),
        CompositionSubcommand::Patch(args) => send_ipc(
            "compositions-update-track",
            json!({
                "project": args.project,
                "composition": args.composition,
                "clip": args.clip,
                "track": args.track,
                "item": args.item,
                "field": args.field,
                "value": parse_value(&args.value)
            }),
        ),
        CompositionSubcommand::Validate(args) => validate(args.project, args.composition),
    }
}

fn validate(project: String, composition: String) -> Result<(), NfError> {
    let storage = JsonStorage::new(JsonStorage::default_root()?);
    storage.load_project(&project)?;
    if !storage.composition_exists(&project, &composition)? {
        return Err(NfError::ValidationFailed(format!(
            "composition not found: {project}/{composition}"
        )));
    }
    let composition_json = storage.load_composition(&project, &composition)?;
    let report = validate_composition_components(&storage, &project, &composition_json)?;
    print_json(&serde_json::to_value(&report)?)?;
    if report.ok {
        Ok(())
    } else {
        Err(NfError::ValidationFailed(format!(
            "composition component validation failed: {project}/{composition}"
        )))
    }
}

fn parse_value(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()))
}
