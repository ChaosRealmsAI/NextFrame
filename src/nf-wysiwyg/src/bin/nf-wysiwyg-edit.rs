use std::io::{self, Read};

use anyhow::{bail, Context, Result};
use nf_wysiwyg::{apply, EditOp, Layer, Timeline};
use serde_json::{json, Map, Value};

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
    let mut raw: Value = serde_json::from_str(&input)
        .context("failed to parse timeline JSON from stdin. Fix: pass valid JSON")?;
    let mut timeline = build_timeline(&raw)?;
    let layers = raw
        .get("layers")
        .and_then(Value::as_array)
        .context("timeline.layers must be an array. Fix: provide a valid timeline JSON file")?;
    let before = layers.get(cli.layer).cloned().with_context(|| {
        format!(
            "layer index {} is out of range. Fix: choose an existing layer",
            cli.layer
        )
    })?;
    apply(cli.op, &mut timeline)?;
    write_timeline(&mut raw, &timeline)?;
    let after = raw
        .get("layers")
        .and_then(Value::as_array)
        .and_then(|items| items.get(cli.layer))
        .cloned()
        .with_context(|| {
            format!(
                "Internal: updated layer {} was not found in output timeline",
                cli.layer
            )
        })?;
    println!(
        "{}",
        serde_json::to_string(&json!({
            "ok": true,
            "before": before,
            "after": after,
            "timeline": raw,
        }))?
    );
    Ok(())
}

struct CliOp {
    layer: usize,
    op: EditOp,
}

fn parse_cli(args: Vec<String>) -> Result<CliOp> {
    let mut layer = None;
    let mut action = None;
    let mut dx = 0.0;
    let mut dy = 0.0;
    let mut dw = 0.0;
    let mut dh = 0.0;
    let mut value = None;
    for arg in args {
        if let Some(raw) = arg.strip_prefix("--layer=") {
            layer = Some(
                raw.parse::<usize>()
                    .context("invalid --layer value. Fix: use a non-negative integer")?,
            );
        } else if let Some(raw) = arg.strip_prefix("--action=") {
            action = Some(raw.to_string());
        } else if let Some(raw) = arg.strip_prefix("--dx=") {
            dx = parse_f64(raw, "--dx")?;
        } else if let Some(raw) = arg.strip_prefix("--dy=") {
            dy = parse_f64(raw, "--dy")?;
        } else if let Some(raw) = arg.strip_prefix("--dw=") {
            dw = parse_f64(raw, "--dw")?;
        } else if let Some(raw) = arg.strip_prefix("--dh=") {
            dh = parse_f64(raw, "--dh")?;
        } else if let Some(raw) = arg.strip_prefix("--value=") {
            value = Some(raw.to_string());
        }
    }
    let layer = layer.context("missing --layer. Fix: pass --layer=N")?;
    let action = action.context("missing --action. Fix: pass --action=move|resize|edit-text")?;
    let op = match action.as_str() {
        "move" => EditOp::Move {
            layer,
            x: dx,
            y: dy,
        },
        "resize" => EditOp::Resize {
            layer,
            width: dw,
            height: dh,
        },
        "edit-text" => EditOp::EditText {
            layer,
            text: value.context("missing --value for edit-text. Fix: pass --value=TEXT")?,
        },
        _ => bail!("unsupported action \"{action}\". Fix: use move, resize, or edit-text"),
    };
    Ok(CliOp { layer, op })
}

fn parse_f64(raw: &str, flag: &str) -> Result<f64> {
    raw.parse::<f64>()
        .with_context(|| format!("invalid {flag} value. Fix: use a finite number"))
}

fn build_timeline(raw: &Value) -> Result<Timeline> {
    let layers = raw
        .get("layers")
        .and_then(Value::as_array)
        .context("timeline.layers must be an array. Fix: provide a valid timeline JSON file")?;
    Ok(Timeline {
        ratio: string_field(raw, "ratio").unwrap_or_default(),
        width: number_field(raw, "width").unwrap_or(1920.0).max(0.0) as u32,
        height: number_field(raw, "height").unwrap_or(1080.0).max(0.0) as u32,
        fps: number_field(raw, "fps").unwrap_or(30.0).max(0.0) as u32,
        duration: number_field(raw, "duration").unwrap_or(0.0),
        layers: layers.iter().map(layer_from_value).collect(),
    })
}

fn layer_from_value(value: &Value) -> Layer {
    let layout = value.get("layout");
    let params = value
        .get("params")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));
    Layer {
        scene: string_field(value, "scene").unwrap_or_default(),
        start: number_field(value, "start").unwrap_or(0.0),
        duration: number_field(value, "dur")
            .or_else(|| number_field(value, "duration"))
            .unwrap_or(0.0),
        x: number_field_from(layout, "x")
            .or_else(|| number_field(value, "x"))
            .unwrap_or(0.0),
        y: number_field_from(layout, "y")
            .or_else(|| number_field(value, "y"))
            .unwrap_or(0.0),
        width: number_field_from(layout, "w")
            .or_else(|| number_field(value, "w"))
            .or_else(|| number_field(value, "width"))
            .unwrap_or(100.0),
        height: number_field_from(layout, "h")
            .or_else(|| number_field(value, "h"))
            .or_else(|| number_field(value, "height"))
            .unwrap_or(100.0),
        text: string_field_from(Some(&params), "text")
            .or_else(|| string_field(value, "text"))
            .unwrap_or_default(),
        params,
    }
}

fn write_timeline(raw: &mut Value, timeline: &Timeline) -> Result<()> {
    let layers = raw
        .get_mut("layers")
        .and_then(Value::as_array_mut)
        .context("timeline.layers must be an array. Fix: provide a valid timeline JSON file")?;
    if layers.len() != timeline.layers.len() {
        bail!("Internal: raw timeline layer count diverged during edit");
    }
    for (raw_layer, layer) in layers.iter_mut().zip(timeline.layers.iter()) {
        write_layer(raw_layer, layer)?;
    }
    Ok(())
}

fn write_layer(raw_layer: &mut Value, layer: &Layer) -> Result<()> {
    let obj = raw_layer.as_object_mut().context(
        "layer entry must be an object. Fix: provide layer objects inside timeline.layers",
    )?;
    obj.insert("start".into(), json!(layer.start));
    if obj.contains_key("dur") || !obj.contains_key("duration") {
        obj.insert("dur".into(), json!(layer.duration));
    }
    if obj.contains_key("duration") {
        obj.insert("duration".into(), json!(layer.duration));
    }
    let prefer_layout = matches!(obj.get("layout"), Some(Value::Object(_)))
        || (!obj.contains_key("x")
            && !obj.contains_key("y")
            && !obj.contains_key("w")
            && !obj.contains_key("h")
            && !obj.contains_key("width")
            && !obj.contains_key("height"));
    if prefer_layout {
        let layout = ensure_object_field(obj, "layout")?;
        layout.insert("x".into(), json!(layer.x));
        layout.insert("y".into(), json!(layer.y));
        layout.insert("w".into(), json!(layer.width));
        layout.insert("h".into(), json!(layer.height));
    }
    if obj.contains_key("x") {
        obj.insert("x".into(), json!(layer.x));
    }
    if obj.contains_key("y") {
        obj.insert("y".into(), json!(layer.y));
    }
    if obj.contains_key("w") {
        obj.insert("w".into(), json!(layer.width));
    }
    if obj.contains_key("h") {
        obj.insert("h".into(), json!(layer.height));
    }
    if obj.contains_key("width") {
        obj.insert("width".into(), json!(layer.width));
    }
    if obj.contains_key("height") {
        obj.insert("height".into(), json!(layer.height));
    }
    let prefer_params =
        matches!(obj.get("params"), Some(Value::Object(_))) || !obj.contains_key("text");
    if prefer_params {
        let params = ensure_object_field(obj, "params")?;
        params.insert("text".into(), Value::String(layer.text.clone()));
    }
    if obj.contains_key("text") {
        obj.insert("text".into(), Value::String(layer.text.clone()));
    }
    Ok(())
}

fn ensure_object_field<'a>(
    obj: &'a mut Map<String, Value>,
    key: &str,
) -> Result<&'a mut Map<String, Value>> {
    if !obj.contains_key(key) {
        obj.insert(key.to_string(), Value::Object(Map::new()));
    }
    match obj.get_mut(key) {
        Some(Value::Object(map)) => Ok(map),
        Some(_) => {
            bail!("field \"{key}\" must be an object. Fix: remove or fix the invalid {key} field")
        }
        None => bail!("Internal: missing field {key} after initialization"),
    }
}

fn number_field(value: &Value, key: &str) -> Option<f64> {
    value
        .as_object()
        .and_then(|obj| obj.get(key))
        .and_then(Value::as_f64)
}

fn number_field_from(value: Option<&Value>, key: &str) -> Option<f64> {
    value
        .and_then(Value::as_object)
        .and_then(|obj| obj.get(key))
        .and_then(Value::as_f64)
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .as_object()
        .and_then(|obj| obj.get(key))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn string_field_from(value: Option<&Value>, key: &str) -> Option<String> {
    value
        .and_then(Value::as_object)
        .and_then(|obj| obj.get(key))
        .and_then(Value::as_str)
        .map(str::to_string)
}
