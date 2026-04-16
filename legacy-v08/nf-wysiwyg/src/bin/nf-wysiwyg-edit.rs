//! Thin CLI wrapper around nf_wysiwyg::apply.
//! Reads timeline JSON from stdin, applies one EditOp, prints JSON to stdout.
//! Usage:
//!   nf-wysiwyg-edit --layer=N --action=<move|resize|edit-text> [--dx --dy --dw --dh --value]

use std::io::{self, Read};

use anyhow::{bail, Context, Result};
use nf_wysiwyg::{apply, EditOp, Timeline};
use serde_json::{json, Value};

fn main() {
    let code = match run() {
        Ok(()) => 0,
        Err(err) => {
            println!("{}", json!({ "ok": false, "error": err.to_string() }));
            1
        }
    };
    std::process::exit(code);
}

fn run() -> Result<()> {
    let cli = parse_cli(std::env::args().skip(1).collect())?;
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).context(
        "failed to read timeline JSON from stdin. Fix: pipe timeline JSON into nf-wysiwyg-edit",
    )?;
    let before: Value = serde_json::from_str(&input)
        .context("failed to parse timeline JSON from stdin. Fix: pass valid JSON")?;
    let mut timeline: Timeline = serde_json::from_value(before.clone())
        .context("timeline JSON does not match v0.7 schema (expect layers[].layout {x,y,w,h} and params)")?;

    let before_layer = before
        .get("layers")
        .and_then(Value::as_array)
        .and_then(|arr| arr.get(cli.layer))
        .cloned()
        .with_context(|| format!("layer index {} is out of range", cli.layer))?;

    apply(cli.op, &mut timeline)?;
    let after_val = serde_json::to_value(&timeline)?;
    let after_layer = after_val
        .get("layers")
        .and_then(Value::as_array)
        .and_then(|arr| arr.get(cli.layer))
        .cloned()
        .unwrap_or(Value::Null);

    println!(
        "{}",
        serde_json::to_string(&json!({
            "ok": true,
            "before": before_layer,
            "after": after_layer,
            "timeline": after_val,
        }))?
    );
    Ok(())
}

struct CliOp {
    layer: usize,
    op: EditOp,
}

fn parse_cli(args: Vec<String>) -> Result<CliOp> {
    let mut layer: Option<usize> = None;
    let mut action: Option<String> = None;
    let mut dx = 0.0_f64;
    let mut dy = 0.0_f64;
    let mut dw = 0.0_f64;
    let mut dh = 0.0_f64;
    let mut value: Option<String> = None;

    for arg in args {
        if let Some(rest) = arg.strip_prefix("--layer=") {
            layer = Some(rest.parse().context("--layer must be usize")?);
        } else if let Some(rest) = arg.strip_prefix("--action=") {
            action = Some(rest.to_string());
        } else if let Some(rest) = arg.strip_prefix("--dx=") {
            dx = rest.parse().context("--dx must be f64")?;
        } else if let Some(rest) = arg.strip_prefix("--dy=") {
            dy = rest.parse().context("--dy must be f64")?;
        } else if let Some(rest) = arg.strip_prefix("--dw=") {
            dw = rest.parse().context("--dw must be f64")?;
        } else if let Some(rest) = arg.strip_prefix("--dh=") {
            dh = rest.parse().context("--dh must be f64")?;
        } else if let Some(rest) = arg.strip_prefix("--value=") {
            value = Some(rest.to_string());
        }
    }

    let layer = layer.context("--layer is required")?;
    let action = action.context("--action is required (move|resize|edit-text)")?;
    let op = match action.as_str() {
        "move" => EditOp::Move { layer, x: dx, y: dy },
        "resize" => EditOp::Resize { layer, width: dw, height: dh },
        "edit-text" => EditOp::EditText {
            layer,
            text: value.context("--value is required for edit-text")?,
        },
        other => bail!("unknown --action '{other}'. Use move|resize|edit-text"),
    };
    Ok(CliOp { layer, op })
}
