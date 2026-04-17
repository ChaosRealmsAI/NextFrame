use axum::{extract::State, Json};

use crate::commands::ai_ops::serve::state::{AppState, StatusResponse};

pub async fn handle(State(state): State<AppState>) -> Json<StatusResponse> {
    Json(state.status())
}
