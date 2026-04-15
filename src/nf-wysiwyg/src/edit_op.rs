use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

use crate::timeline::Timeline;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub enum EditOp {
    Move {
        layer: usize,
        x: f64,
        y: f64,
    },
    Resize {
        layer: usize,
        width: f64,
        height: f64,
    },
    EditText {
        layer: usize,
        text: String,
    },
}

pub fn apply(op: EditOp, timeline: &mut Timeline) -> Result<()> {
    let (layer_index, action) = match op {
        EditOp::Move { layer, x, y } => (layer, LayerAction::Move { dx: x, dy: y }),
        EditOp::Resize {
            layer,
            width,
            height,
        } => (
            layer,
            LayerAction::Resize {
                dw: width,
                dh: height,
            },
        ),
        EditOp::EditText { layer, text } => (layer, LayerAction::EditText { text }),
    };
    let Some(target) = timeline.layers.get_mut(layer_index) else {
        bail!(
            "layer index {} is out of range. Fix: choose --layer between 0 and {}",
            layer_index,
            timeline.layers.len().saturating_sub(1)
        );
    };
    match action {
        LayerAction::Move { dx, dy } => {
            target.layout.x += dx;
            target.layout.y += dy;
        }
        LayerAction::Resize { dw, dh } => {
            let next_w = target.layout.w + dw;
            let next_h = target.layout.h + dh;
            if next_w <= 0.0 || next_h <= 0.0 {
                bail!("resize would make the layer non-positive. Fix: keep resulting width and height above 0");
            }
            target.layout.w = next_w;
            target.layout.h = next_h;
        }
        LayerAction::EditText { text } => {
            if let serde_json::Value::Object(ref mut map) = target.params {
                map.insert("text".to_string(), serde_json::Value::String(text));
            } else {
                let mut map = serde_json::Map::new();
                map.insert("text".to_string(), serde_json::Value::String(text));
                target.params = serde_json::Value::Object(map);
            }
        }
    }
    Ok(())
}

enum LayerAction {
    Move { dx: f64, dy: f64 },
    Resize { dw: f64, dh: f64 },
    EditText { text: String },
}
