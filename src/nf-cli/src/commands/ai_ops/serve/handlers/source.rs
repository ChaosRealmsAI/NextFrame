use axum::{extract::State, Json};
use serde::Serialize;
use serde_json::Value;

use crate::commands::ai_ops::serve::state::{AppState, SourceCurrentResponse};

#[derive(Debug, Serialize)]
pub struct SourceWritebackResponse {
    pub accepted: bool,
    pub version: u64,
}

pub async fn current(State(state): State<AppState>) -> Json<SourceCurrentResponse> {
    Json(state.current_source())
}

pub async fn writeback(
    State(state): State<AppState>,
    Json(source): Json<Value>,
) -> Json<SourceWritebackResponse> {
    Json(SourceWritebackResponse {
        accepted: true,
        version: state.writeback_source(source),
    })
}
