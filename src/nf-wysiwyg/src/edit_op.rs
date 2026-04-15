use anyhow::Result;
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
    let _ = (op, timeline);
    Ok(())
}
