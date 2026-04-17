mod handlers {
    pub mod action;
    pub mod describe;
    pub mod events;
    pub mod health;
    pub mod screenshot;
    pub mod source;
    pub mod status;
}
pub mod state;

use std::io::{self, Write};
use std::net::SocketAddr;

use axum::{
    routing::{get, post},
    Router,
};
use tower::ServiceBuilder;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::commands::ai_ops::ServeArgs;

pub use self::state::AppState;

pub async fn run(args: ServeArgs) -> anyhow::Result<()> {
    let state = AppState::new()?;
    let app = router(state);
    let listener = tokio::net::TcpListener::bind(SocketAddr::from((args.bind, args.port))).await?;
    let local_addr = listener.local_addr()?;
    print_boot_line(local_addr.port())?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(handlers::health::handle))
        .route("/status", get(handlers::status::handle))
        .route("/action", post(handlers::action::handle))
        .route("/screenshot", get(handlers::screenshot::handle))
        .route("/events", get(handlers::events::handle))
        .route("/source/current", get(handlers::source::current))
        .route("/source/writeback", post(handlers::source::writeback))
        .route("/ai-ops/describe", get(handlers::describe::handle))
        .with_state(state)
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive()),
        )
}

fn print_boot_line(port: u16) -> anyhow::Result<()> {
    let payload = serde_json::json!({
        "port": port,
        "pid": std::process::id(),
    });
    println!("{}", serde_json::to_string(&payload)?);
    io::stdout().flush()?;
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
