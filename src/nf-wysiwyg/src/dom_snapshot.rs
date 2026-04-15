use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct DomSnapshot {
    #[serde(default)]
    pub html: String,
    #[serde(default)]
    pub css: String,
    #[serde(default)]
    pub fonts: Vec<String>,
}
