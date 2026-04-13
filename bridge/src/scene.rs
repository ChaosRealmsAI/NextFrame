use serde_json::{json, Value};

use crate::util::validation::require_object;

pub(crate) fn handle_scene_list(params: &Value) -> Result<Value, String> {
    require_object(params)?;

    Ok(json!([
        {
            "id": "auroraGradient",
            "name": "Aurora Gradient",
            "category": "Backgrounds"
        },
        {
            "id": "kineticHeadline",
            "name": "Kinetic Headline",
            "category": "Typography"
        },
        {
            "id": "neonGrid",
            "name": "Neon Grid",
            "category": "Shapes & Layout"
        },
        {
            "id": "starfield",
            "name": "Starfield",
            "category": "Backgrounds"
        },
        {
            "id": "circleRipple",
            "name": "Circle Ripple",
            "category": "Shapes & Layout"
        },
        {
            "id": "countdown",
            "name": "Countdown",
            "category": "Typography"
        },
        {
            "id": "barChartReveal",
            "name": "Bar Chart Reveal",
            "category": "Data Viz"
        },
        {
            "id": "lineChart",
            "name": "Line Chart",
            "category": "Data Viz"
        },
        {
            "id": "lowerThirdVelvet",
            "name": "Lower Third Velvet",
            "category": "Overlays"
        },
        {
            "id": "cornerBadge",
            "name": "Corner Badge",
            "category": "Overlays"
        }
    ]))
}
