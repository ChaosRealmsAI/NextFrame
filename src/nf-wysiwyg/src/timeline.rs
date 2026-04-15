use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Timeline {
    #[serde(default)]
    pub ratio: String,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    #[serde(default)]
    pub fps: u32,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub layers: Vec<Layer>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Layer {
    #[serde(default)]
    pub scene: String,
    #[serde(default)]
    pub start: f64,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub params: Value,
}
