//! NextFrame Desktop — native macOS app via objc2
//! No Tao, no Wry. Direct AppKit + WKWebView.

mod app;
mod ipc;
mod protocol;
mod verify;
mod webview;
mod window;

fn main() {
    // Tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("nf_desktop=info".parse().unwrap_or_default()),
        )
        .init();

    tracing::info!("NextFrame Desktop starting");

    app::run();
}
