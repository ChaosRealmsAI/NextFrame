use std::{
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::Duration,
};

use tao::{
    dpi::{LogicalPosition, LogicalSize},
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::WindowBuilder,
};
use wry::{PageLoadEvent, WebViewBuilder};

pub const EDITOR_HTML: &str =
    "/Users/Zhuanz/bigbang/NextFrame/spec/design/prototypes/editor-v0.1.html";

const DEFAULT_POS_X: f64 = 80.0;
const DEFAULT_POS_Y: f64 = 80.0;
const DEFAULT_WIDTH: f64 = 840.0;
const DEFAULT_HEIGHT: f64 = 640.0;

#[derive(Clone, Copy)]
pub enum WryMode {
    Default,
    Transparent,
}

enum UserEvent {
    Ipc(String),
    RunMeasure,
    Timeout,
}

pub fn open_safari_baseline() -> Result<(), Box<dyn Error>> {
    let path = Path::new(EDITOR_HTML);
    let status = Command::new("open")
        .arg("-a")
        .arg("Safari")
        .arg(path)
        .status()?;
    if !status.success() {
        return Err(format!("open -a Safari failed with status {status}").into());
    }
    Ok(())
}

pub fn run_wry(mode: WryMode) -> Result<(), Box<dyn Error>> {
    let args = RunArgs::from_env();
    let title = match mode {
        WryMode::Default => "NextFrame POC WRY Default",
        WryMode::Transparent => "NextFrame POC WRY Transparent",
    };
    let measure_on_load = !args.no_measure;

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let window = WindowBuilder::new()
        .with_title(title)
        .with_inner_size(LogicalSize::new(DEFAULT_WIDTH, DEFAULT_HEIGHT))
        .with_position(LogicalPosition::new(DEFAULT_POS_X, DEFAULT_POS_Y))
        .with_decorations(!matches!(mode, WryMode::Transparent))
        .with_transparent(matches!(mode, WryMode::Transparent))
        .build(&event_loop)?;

    let metrics_path = args.metrics_path.clone();
    let ipc_proxy = proxy.clone();
    let load_proxy = proxy.clone();
    let title_proxy = proxy.clone();
    let mut builder = WebViewBuilder::new()
        .with_url(file_url(Path::new(EDITOR_HTML))?)
        .with_initialization_script(transparent_init_script(matches!(mode, WryMode::Transparent)))
        .with_on_page_load_handler(move |event, _url| {
            if measure_on_load && matches!(event, PageLoadEvent::Finished) {
                let _ = load_proxy.send_event(UserEvent::RunMeasure);
            }
        })
        .with_document_title_changed_handler(move |title| {
            if let Some(body) = title.strip_prefix("NFPOC:") {
                let _ = title_proxy.send_event(UserEvent::Ipc(body.to_string()));
            }
        })
        .with_ipc_handler(move |request| {
            let body = request.body().clone();
            let _ = ipc_proxy.send_event(UserEvent::Ipc(body));
        });

    if matches!(mode, WryMode::Transparent) {
        builder = builder.with_transparent(true);
    }

    let webview = builder.build(&window)?;

    let timeout_proxy = proxy.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(45));
        let _ = timeout_proxy.send_event(UserEvent::Timeout);
    });

    event_loop.run(move |event, _, control_flow| {
        let _keep_alive = (&window, &webview);
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(UserEvent::Ipc(body)) => {
                println!("{body}");
                if let Some(path) = &metrics_path {
                    if let Err(err) = fs::write(path, format!("{body}\n")) {
                        eprintln!("failed to write metrics {}: {err}", path.display());
                    }
                }
                if args.exit_after_metrics {
                    *control_flow = ControlFlow::Exit;
                }
            }
            Event::UserEvent(UserEvent::RunMeasure) => {
                if let Err(err) = webview.evaluate_script(&measure_script()) {
                    eprintln!("failed to run benchmark script: {err}");
                    if args.exit_after_metrics {
                        *control_flow = ControlFlow::ExitWithCode(3);
                    }
                }
            }
            Event::UserEvent(UserEvent::Timeout) => {
                if args.exit_after_metrics {
                    eprintln!("timed out waiting for metrics");
                    *control_flow = ControlFlow::ExitWithCode(2);
                }
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => *control_flow = ControlFlow::Exit,
            _ => {}
        }
    });
}

struct RunArgs {
    metrics_path: Option<PathBuf>,
    exit_after_metrics: bool,
    no_measure: bool,
}

impl RunArgs {
    fn from_env() -> Self {
        let mut metrics_path = None;
        let mut exit_after_metrics = false;
        let mut no_measure = false;
        let mut args = env::args().skip(1);
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--metrics" => metrics_path = args.next().map(PathBuf::from),
                "--exit-after-metrics" => exit_after_metrics = true,
                "--no-measure" => no_measure = true,
                _ => {}
            }
        }
        Self {
            metrics_path,
            exit_after_metrics,
            no_measure,
        }
    }
}

fn file_url(path: &Path) -> Result<String, Box<dyn Error>> {
    let canonical = path.canonicalize()?;
    Ok(format!("file://{}", canonical.display()))
}

fn transparent_init_script(transparent: bool) -> String {
    if !transparent {
        return String::new();
    }

    r#"
(() => {
  document.documentElement.classList.add('nf-transparent-webview');
  const style = document.createElement('style');
  style.textContent = `
    html.nf-transparent-webview,
    html.nf-transparent-webview body { background: transparent !important; }
    html.nf-transparent-webview .app {
      box-shadow:
        0 30px 90px rgba(0, 0, 0, 0.48),
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        inset 0 0 0 0.5px rgba(255, 255, 255, 0.04);
    }
  `;
  document.documentElement.appendChild(style);
})();
"#
    .to_string()
}

fn measure_script() -> String {
    r#"
(() => {
  const countAuroraLayers = (backgroundImage) =>
    (backgroundImage.match(/radial-gradient/g) || []).length;

  const run = () => {
    const topbar = document.querySelector('.topbar');
    const topbarStyle = getComputedStyle(topbar);
    const appStyle = getComputedStyle(document.querySelector('.app'));
    const bodyBefore = getComputedStyle(document.body, '::before');
    const bodyAfter = getComputedStyle(document.body, '::after');
    const scroller = document.scrollingElement || document.documentElement;
    const maxY = Math.max(1, scroller.scrollHeight - window.innerHeight);
    const frameTarget = 1000;
    const start = performance.now();
    let frames = 0;

    const tick = () => {
      frames += 1;
      scroller.scrollTop = (frames * 3) % maxY;
      if (frames < frameTarget) {
        requestAnimationFrame(tick);
      } else {
        const elapsedMs = performance.now() - start;
        const payload = {
          url: location.href,
          transparent: document.documentElement.classList.contains('nf-transparent-webview'),
          viewport: { width: window.innerWidth, height: window.innerHeight },
          topbar: {
            background: topbarStyle.getPropertyValue('background'),
            backgroundColor: topbarStyle.backgroundColor,
            backdropFilter: topbarStyle.backdropFilter || topbarStyle.webkitBackdropFilter,
            webkitBackdropFilter: topbarStyle.webkitBackdropFilter,
            height: topbarStyle.height
          },
          app: {
            backgroundColor: appStyle.backgroundColor,
            backdropFilter: appStyle.backdropFilter || appStyle.webkitBackdropFilter,
            webkitBackdropFilter: appStyle.webkitBackdropFilter
          },
          aurora: {
            layerCount: countAuroraLayers(bodyBefore.backgroundImage)
          },
          grain: {
            hasSvgNoise: bodyAfter.backgroundImage.includes('data:image/svg+xml'),
            mixBlendMode: bodyAfter.mixBlendMode,
            opacity: bodyAfter.opacity
          },
          scroll: {
            frames,
            elapsedMs,
            fps: frames * 1000 / elapsedMs,
            maxY
          }
        };
        document.title = 'NFPOC:' + JSON.stringify(payload);
      }
    };

    requestAnimationFrame(tick);
  };

  setTimeout(run, 250);
})();
"#
    .to_string()
}
