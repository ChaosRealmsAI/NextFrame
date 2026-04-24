//! wry-transparent: Transparent WebView + no decorations.
//!
//! Same probe as wry_default but with `with_transparent(true)` on both
//! tao window AND wry webview → glass should compose over desktop.

use std::path::PathBuf;
use tao::{
    event::{Event, StartCause, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::WindowBuilder,
};
use wry::WebViewBuilder;

fn spec_html_path() -> PathBuf {
    let manifest = env!("CARGO_MANIFEST_DIR");
    PathBuf::from(manifest)
        .parent()
        .map(|p| p.join("spec/design/prototypes/editor-v0.1.html"))
        .unwrap_or_else(|| PathBuf::from("../spec/design/prototypes/editor-v0.1.html"))
}

fn probe_script() -> &'static str {
    r#"
    (function() {
      try { document.title = 'NF-INIT-T-' + Date.now(); } catch (e) {}
      function post(p) { try { window.ipc.postMessage(JSON.stringify(p)); } catch (e) {} }
      post({evt: 'init_fired', variant: 'transparent'});

      var tries = 0;
      var iv = setInterval(function() {
        tries++;
        var topbar = document.querySelector('.topbar');
        if (!topbar && tries < 100) return;
        clearInterval(iv);
        if (!topbar) { post({evt: 'probe_fail', err: 'no .topbar'}); return; }

        var cs = getComputedStyle(topbar);
        var rect = topbar.getBoundingClientRect();
        var beforeCs = getComputedStyle(document.body, '::before');
        var afterCs  = getComputedStyle(document.body, '::after');
        var panel = document.querySelector('.panel');
        var panelCs = panel ? getComputedStyle(panel) : null;

        var out = {
          variant: 'transparent',
          topbar: {
            rect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
            background: cs.background || cs.backgroundColor,
            backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter
          },
          aurora_layers: ((beforeCs.backgroundImage || '').match(/radial-gradient\(/g) || []).length,
          grain_present: (afterCs.backgroundImage || '').indexOf('svg') !== -1,
          body_after_blend: afterCs.mixBlendMode,
          panel_backdrop: panelCs ? (panelCs.backdropFilter || panelCs.webkitBackdropFilter) : null,
          viewport: {w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio}
        };

        var frames = 60, start = performance.now(), i = 0;
        function tick() {
          window.scrollTo(0, (i * 4) % 200);
          i++;
          if (i < frames) requestAnimationFrame(tick);
          else {
            var elapsed = performance.now() - start;
            out.fps = Math.round((frames / elapsed) * 1000 * 10) / 10;
            out.fps_elapsed_ms = Math.round(elapsed * 10) / 10;
            post(out);
            try {
              var summary = {
                variant: 't',
                ok: 1,
                topbar_bg: (out.topbar.background.match(/rgba\([^)]+\)/) || [])[0],
                topbar_bdf: out.topbar.backdropFilter,
                topbar_rect: out.topbar.rect,
                aurora: out.aurora_layers,
                grain: out.grain_present ? 1 : 0,
                blend: out.body_after_blend,
                panel_bdf: out.panel_backdrop,
                fps: out.fps,
                fps_ms: out.fps_elapsed_ms,
                vp: out.viewport
              };
              document.title = 'NF-SUM ' + JSON.stringify(summary);
            } catch (e) {}
          }
        }
        requestAnimationFrame(tick);
      }, 100);
    })();
    "#
}

fn main() -> wry::Result<()> {
    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("NF POC · wry transparent")
        .with_inner_size(tao::dpi::LogicalSize::new(1280.0, 800.0))
        .with_decorations(false)
        .with_transparent(true)
        .with_resizable(true)
        .build(&event_loop)
        .map_err(|e| wry::Error::Io(std::io::Error::other(e.to_string())))?;

    let html_path = spec_html_path();
    if !html_path.exists() {
        eprintln!("[POC] editor-v0.1.html not found at {:?}", html_path);
        std::process::exit(2);
    }
    let url = format!("file://{}", html_path.display());
    eprintln!("[POC] loading {} (transparent)", url);

    let _webview = WebViewBuilder::new()
        .with_url(url)
        .with_transparent(true)
        .with_initialization_script(probe_script())
        .with_ipc_handler(|req| {
            use std::io::Write;
            let stdout = std::io::stdout();
            let mut h = stdout.lock();
            let _ = writeln!(h, "NFPROBE {}", req.body());
            let _ = h.flush();
        })
        .with_document_title_changed_handler(|title| {
            use std::io::Write;
            let stdout = std::io::stdout();
            let mut h = stdout.lock();
            let _ = writeln!(h, "NFTITLE {}", title);
            let _ = h.flush();
        })
        .build(&window)?;

    event_loop.run(move |event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => {
                eprintln!("[POC] transparent window opened");
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => *control_flow = ControlFlow::Exit,
            _ => (),
        }
    });
}
