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
            target.x += dx;
            target.y += dy;
        }
        LayerAction::Resize { dw, dh } => {
            let next_width = target.width + dw;
            let next_height = target.height + dh;
            if next_width <= 0.0 || next_height <= 0.0 {
                bail!("resize would make the layer non-positive. Fix: keep resulting width and height above 0");
            }
            target.width = next_width;
            target.height = next_height;
        }
        LayerAction::EditText { text } => {
            target.text = text;
        }
    }
    Ok(())
}

enum LayerAction {
    Move { dx: f64, dy: f64 },
    Resize { dw: f64, dh: f64 },
    EditText { text: String },
}
