//! wry-default: Default WebView, no transparency.
//!
//! Loads editor-v0.1.html from spec/design/prototypes/ via file:// URL.
//! Window size 1280x800 (big enough to see the full editor UI).
//!
//! After window paints, injects a JS probe that collects computed-style +
//! runs a 60-frame scroll FPS benchmark, then prints results to stdout via
//! an IPC handler so the Rust side can log them deterministically.

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
    // Poll-based probe: ensures we run after body + all CSS applied regardless
    // of readyState race. Reports init_fired immediately then a full result.
    r#"
    (function() {
      // Mark init ran even before window.ipc exists (for debug).
      try { document.title = 'NF-INIT-' + Date.now(); } catch (e) {}
      function post(p) {
        try { window.ipc.postMessage(JSON.stringify(p)); } catch (e) {}
      }
      post({evt: 'init_fired', ts: Date.now()});

      var tries = 0;
      var iv = setInterval(function() {
        tries++;
        var topbar = document.querySelector('.topbar');
        if (!topbar && tries < 100) return;
        clearInterval(iv);
        if (!topbar) { post({evt: 'probe_fail', err: 'no .topbar', tries: tries}); return; }

        var cs = getComputedStyle(topbar);
        var rect = topbar.getBoundingClientRect();
        var beforeCs = getComputedStyle(document.body, '::before');
        var afterCs  = getComputedStyle(document.body, '::after');
        var panel = document.querySelector('.panel');
        var panelCs = panel ? getComputedStyle(panel) : null;

        var out = {
          evt: 'probe_done',
          topbar: {
            rect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
            background: cs.background || cs.backgroundColor,
            backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
            borderBottom: cs.borderBottom
          },
          body_before_bg: beforeCs.backgroundImage,
          body_after_bg:  afterCs.backgroundImage,
          body_after_blend: afterCs.mixBlendMode,
          aurora_layers: ((beforeCs.backgroundImage || '').match(/radial-gradient\(/g) || []).length,
          grain_present: (afterCs.backgroundImage || '').indexOf('svg') !== -1,
          panel_backdrop: panelCs ? (panelCs.backdropFilter || panelCs.webkitBackdropFilter) : null,
          userAgent: navigator.userAgent,
          viewport: {w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio}
        };

        // FPS: animate scrollTop over 60 frames
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
              // Fallback channel: condensed summary (title len-limited).
              var summary = {
                ok: 1,
                topbar_bg:     (out.topbar.background.match(/rgba\([^)]+\)/) || [])[0],
                topbar_bdf:    out.topbar.backdropFilter,
                topbar_rect:   out.topbar.rect,
                aurora:        out.aurora_layers,
                grain:         out.grain_present ? 1 : 0,
                blend:         out.body_after_blend,
                panel_bdf:     out.panel_backdrop,
                fps:           out.fps,
                fps_ms:        out.fps_elapsed_ms,
                vp:            out.viewport
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
        .with_title("NF POC · wry default")
        .with_inner_size(tao::dpi::LogicalSize::new(1280.0, 800.0))
        .with_resizable(true)
        .build(&event_loop)
        .map_err(|e| wry::Error::Io(std::io::Error::other(e.to_string())))?;

    let html_path = spec_html_path();
    if !html_path.exists() {
        eprintln!("[POC] editor-v0.1.html not found at {:?}", html_path);
        std::process::exit(2);
    }
    let url = format!("file://{}", html_path.display());
    eprintln!("[POC] loading {}", url);

    let _webview = WebViewBuilder::new()
        .with_url(url)
        .with_initialization_script(probe_script())
        .with_ipc_handler(|req| {
            use std::io::Write;
            let stdout = std::io::stdout();
            let mut handle = stdout.lock();
            let _ = writeln!(handle, "NFPROBE {}", req.body());
            let _ = handle.flush();
        })
        .with_document_title_changed_handler(|title| {
            use std::io::Write;
            let stdout = std::io::stdout();
            let mut handle = stdout.lock();
            let _ = writeln!(handle, "NFTITLE {}", title);
            let _ = handle.flush();
        })
        .build(&window)?;

    event_loop.run(move |event, _target, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => {
                eprintln!("[POC] window opened · probe will run on DOM ready");
            }
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => *control_flow = ControlFlow::Exit,
            _ => (),
        }
    });
}
