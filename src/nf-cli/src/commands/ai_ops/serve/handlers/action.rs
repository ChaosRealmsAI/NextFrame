use axum::{extract::State, Json};
use serde::Deserialize;
use serde::Serialize;

use crate::commands::ai_ops::serve::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ActionRequest {
    pub cmd: String,
    #[serde(default)]
    pub args: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct ActionResponse {
    pub accepted: bool,
    pub action_id: String,
}

pub async fn handle(
    State(_state): State<AppState>,
    Json(request): Json<ActionRequest>,
) -> Json<ActionResponse> {
    let _ = (request.cmd, request.args);
    Json(ActionResponse {
        accepted: true,
        action_id: uuid::Uuid::new_v4().to_string(),
    })
}
