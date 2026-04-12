#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("This binary only supports macOS.");
    std::process::exit(1);
}

#[cfg(target_os = "macos")]
mod macos_app {
    use std::{
        cell::RefCell,
        env,
        error::Error,
        fs,
        path::{Path, PathBuf},
        rc::Rc,
        thread,
        time::{Duration, Instant},
    };

    use image::{imageops::FilterType, ImageFormat};
    use block2::RcBlock;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{MainThreadMarker, NSDictionary, NSError};
    use objc2_web_kit::WKSnapshotConfiguration;
    use tao::{
        dpi::{LogicalPosition, LogicalSize},
        event::{Event, WindowEvent},
        event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
        platform::{
            macos::{ActivationPolicy, EventLoopExtMacOS},
            run_return::EventLoopExtRunReturn,
        },
        window::WindowBuilder,
    };
    use wry::{
        http::{header::CONTENT_TYPE, Request, Response},
        BackgroundThrottlingPolicy, WebView, WebViewBuilder, WebViewExtMacOS,
    };

    const WIDTH: f64 = 1920.0;
    const HEIGHT: f64 = 1080.0;
    const OUTPUT_NAME: &str = "frame_t5.png";
    const BOOTSTRAP_HTML: &str = r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #000;
      }

      canvas {
        display: block;
        width: 1920px;
        height: 1080px;
      }
    </style>
  </head>
  <body>
    <canvas id="frame" width="1920" height="1080"></canvas>
    <script type="module">
      const post = (message) => window.ipc.postMessage(String(message));
      const formatError = (value) => value && value.stack ? value.stack : String(value);

      window.addEventListener("error", (event) => {
        post(`error:${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`);
      });

      window.addEventListener("unhandledrejection", (event) => {
        post(`error:${formatError(event.reason)}`);
      });

      (async () => {
        try {
          const { auroraGradient } = await import("../auroraGradient.js");
          const canvas = document.getElementById("frame");
          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) {
            throw new Error("2D canvas context unavailable");
          }

          const t = Number(new URLSearchParams(location.search).get("t") ?? "0");
          auroraGradient(
            t,
            { hueA: 270, hueB: 200, hueC: 320, intensity: 1, grain: 0.04 },
            ctx
          );

          requestAnimationFrame(() => post("ready"));
        } catch (error) {
          post(`error:${formatError(error)}`);
        }
      })();
    </script>
  </body>
</html>
"#;

    #[derive(Clone, Debug)]
    enum UserEvent {
        PageLoaded,
        PageReady,
        Failure(String),
        SnapshotFinished(Result<(), String>),
    }

    pub fn run() -> Result<(), Box<dyn Error>> {
        let t = parse_t()?;
        let cwd = env::current_dir()?;
        let output_path = cwd.join(OUTPUT_NAME);
        let scene_root = cwd.clone();
        let bootstrap_url = format!("render://localhost/index.html?t={t}");
        let started_at = Instant::now();

        let mut event_loop_builder = EventLoopBuilder::<UserEvent>::with_user_event();
        let mut event_loop = event_loop_builder.build();
        event_loop.set_activation_policy(ActivationPolicy::Accessory);
        event_loop.set_dock_visibility(false);
        event_loop.set_activate_ignoring_other_apps(false);
        let proxy = event_loop.create_proxy();

        let window = WindowBuilder::new()
            .with_visible(true)
            .with_decorations(false)
            .with_resizable(false)
            .with_focused(false)
            .with_inner_size(LogicalSize::new(WIDTH, HEIGHT))
            .with_position(LogicalPosition::new(-10_000.0, -10_000.0))
            .with_title("A-wry-snapshot")
            .build(&event_loop)?;

        let ipc_proxy = proxy.clone();
        let page_load_proxy = proxy.clone();
        let webview = WebViewBuilder::new()
            .with_custom_protocol("render".into(), move |_webview_id, request| {
                match protocol_response(&scene_root, request) {
                    Ok(response) => response.map(Into::into),
                    Err(err) => Response::builder()
                        .status(500)
                        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
                        .body(err.into_bytes())
                        .unwrap()
                        .map(Into::into),
                }
            })
            .with_url(bootstrap_url)
            .with_background_throttling(BackgroundThrottlingPolicy::Disabled)
            .with_on_page_load_handler(move |event, _url| {
                if matches!(event, wry::PageLoadEvent::Finished) {
                    let _ = page_load_proxy.send_event(UserEvent::PageLoaded);
                }
            })
            .with_ipc_handler(move |request| {
                let body = request.body().clone();
                let event = parse_ipc_message(&body);
                let _ = ipc_proxy.send_event(event);
            })
            .build(&window)?;

        let outcome = Rc::new(RefCell::new(Ok(())));
        let outcome_for_loop = outcome.clone();
        let output_path_for_loop = output_path.clone();
        let mut snapshot_started = false;
        let timeout_proxy = proxy.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(15));
            let _ = timeout_proxy.send_event(UserEvent::Failure(
                "timed out waiting for page render or snapshot".into(),
            ));
        });

        event_loop.run_return(move |event, _, control_flow| {
            *control_flow = ControlFlow::Wait;

            match event {
                Event::UserEvent(UserEvent::PageLoaded) => {
                    let ready_proxy = proxy.clone();
                    thread::spawn(move || {
                        thread::sleep(Duration::from_millis(32));
                        let _ = ready_proxy.send_event(UserEvent::PageReady);
                    });
                }
                Event::UserEvent(UserEvent::PageReady) => {
                    if snapshot_started {
                        return;
                    }

                    snapshot_started = true;
                    if let Err(err) =
                        begin_snapshot(&webview, output_path_for_loop.clone(), proxy.clone())
                    {
                        *outcome_for_loop.borrow_mut() = Err(err);
                        *control_flow = ControlFlow::Exit;
                    }
                }
                Event::UserEvent(UserEvent::Failure(message)) => {
                    *outcome_for_loop.borrow_mut() = Err(message);
                    *control_flow = ControlFlow::Exit;
                }
                Event::UserEvent(UserEvent::SnapshotFinished(result)) => {
                    *outcome_for_loop.borrow_mut() = result;
                    *control_flow = ControlFlow::Exit;
                }
                Event::WindowEvent {
                    event: WindowEvent::CloseRequested,
                    ..
                } => {
                    *outcome_for_loop.borrow_mut() =
                        Err("window closed before snapshot finished".into());
                    *control_flow = ControlFlow::Exit;
                }
                _ => {}
            }
        });

        outcome
            .borrow()
            .clone()
            .map_err(Box::<dyn Error>::from)?;

        println!(
            "saved {} in {:.2} ms",
            output_path.display(),
            started_at.elapsed().as_secs_f64() * 1000.0
        );
        Ok(())
    }

    fn parse_t() -> Result<f64, Box<dyn Error>> {
        let raw = env::args()
            .nth(1)
            .ok_or("usage: cargo run --release -- <t-seconds>")?;
        let t = raw.parse::<f64>()?;
        if !t.is_finite() {
            return Err("t must be finite".into());
        }
        Ok(t)
    }

    fn parse_ipc_message(body: &str) -> UserEvent {
        if body == "ready" {
            UserEvent::PageReady
        } else if let Some(message) = body.strip_prefix("error:") {
            UserEvent::Failure(message.to_string())
        } else {
            UserEvent::Failure(format!("unexpected IPC message: {body}"))
        }
    }

    fn protocol_response(
        scene_root: &Path,
        request: Request<Vec<u8>>,
    ) -> Result<Response<Vec<u8>>, String> {
        let path = request.uri().path();
        let (body, mime) = match path {
            "/" | "/index.html" => (
                BOOTSTRAP_HTML.as_bytes().to_vec(),
                "text/html; charset=utf-8",
            ),
            "/../auroraGradient.js" | "/auroraGradient.js" => {
                let script_path = scene_root
                    .parent()
                    .ok_or("failed to resolve parent directory for auroraGradient.js")?
                    .join("auroraGradient.js");
                let body = fs::read(&script_path)
                    .map_err(|err| format!("failed to read {}: {err}", script_path.display()))?;
                (body, "text/javascript; charset=utf-8")
            }
            _ => {
                return Response::builder()
                    .status(404)
                    .header(CONTENT_TYPE, "text/plain; charset=utf-8")
                    .body(format!("not found: {path}").into_bytes())
                    .map_err(|err| err.to_string());
            }
        };

        Response::builder()
            .status(200)
            .header(CONTENT_TYPE, mime)
            .body(body)
            .map_err(|err| err.to_string())
    }

    fn begin_snapshot(
        webview: &WebView,
        output_path: PathBuf,
        proxy: EventLoopProxy<UserEvent>,
    ) -> Result<(), String> {
        let snapshot_config = {
            let mtm = MainThreadMarker::new().ok_or("snapshot must start on the main thread")?;
            let config = unsafe { WKSnapshotConfiguration::new(mtm) };
            unsafe {
                config.setAfterScreenUpdates(true);
            }
            config
        };

        let native_webview = webview.webview();
        let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
            let result = unsafe { save_snapshot(image, error, &output_path) };
            let _ = proxy.send_event(UserEvent::SnapshotFinished(result));
        });

        unsafe {
            native_webview
                .takeSnapshotWithConfiguration_completionHandler(Some(&snapshot_config), &callback);
        }

        Ok(())
    }

    unsafe fn save_snapshot(
        image: *mut NSImage,
        error: *mut NSError,
        output_path: &Path,
    ) -> Result<(), String> {
        if !error.is_null() {
            return Err((&*error).localizedDescription().to_string());
        }

        if image.is_null() {
            return Err("WKWebView returned a null snapshot image".into());
        }

        let tiff_data = (&*image)
            .TIFFRepresentation()
            .ok_or("snapshot image did not produce TIFF data")?;
        let bitmap = NSBitmapImageRep::imageRepWithData(&tiff_data)
            .ok_or("failed to build bitmap representation from snapshot")?;
        let properties = NSDictionary::new();
        let png_data = bitmap
            .representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
            .ok_or("failed to encode snapshot as PNG")?;
        let png_bytes = png_data.to_vec();
        let normalized = normalize_png_size(&png_bytes, output_path)?;

        fs::write(output_path, normalized)
            .map_err(|err| format!("failed to write {}: {err}", output_path.display()))
    }

    fn normalize_png_size(png_bytes: &[u8], output_path: &Path) -> Result<Vec<u8>, String> {
        let image = image::load_from_memory_with_format(png_bytes, ImageFormat::Png)
            .map_err(|err| format!("failed to decode snapshot PNG for {}: {err}", output_path.display()))?;

        if image.width() == WIDTH as u32 && image.height() == HEIGHT as u32 {
            return Ok(png_bytes.to_vec());
        }

        let resized = image.resize_exact(WIDTH as u32, HEIGHT as u32, FilterType::Lanczos3);
        let mut bytes = Vec::new();
        resized
            .write_to(&mut std::io::Cursor::new(&mut bytes), ImageFormat::Png)
            .map_err(|err| format!("failed to re-encode normalized PNG for {}: {err}", output_path.display()))?;
        Ok(bytes)
    }
}

#[cfg(target_os = "macos")]
fn main() {
    if let Err(err) = macos_app::run() {
        eprintln!("{err}");
        std::process::exit(1);
    }
}
