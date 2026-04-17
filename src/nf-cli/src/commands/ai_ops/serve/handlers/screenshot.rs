use std::sync::Arc;

use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderValue},
    response::IntoResponse,
};

use crate::commands::ai_ops::serve::state::AppState;

pub async fn handle(State(state): State<AppState>) -> impl IntoResponse {
    let png = state.screenshot_png();
    (
        [(header::CONTENT_TYPE, HeaderValue::from_static("image/png"))],
        Body::from(Arc::unwrap_or_clone(png)),
    )
}
