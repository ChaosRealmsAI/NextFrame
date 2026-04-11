use std::error::Error;
use std::path::PathBuf;

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::EventLoop;
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

fn main() {
    if let Err(error) = run() {
        eprintln!("failed to start shell: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn Error>> {
    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("NextFrame")
        .with_inner_size(LogicalSize::new(1440.0, 900.0))
        .build(&event_loop)
        .expect("failed to create NextFrame window");

    let webview_url = webview_url()?;
    let _webview = WebViewBuilder::new(&window)
        .with_url(&webview_url)
        .build()?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = tao::event_loop::ControlFlow::Wait;

        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = tao::event_loop::ControlFlow::Exit;
        }
    });
}

fn webview_url() -> Result<String, Box<dyn Error>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../runtime/web/index.html")
        .canonicalize()?;

    Ok(format!("file://{}", path.display()))
}
