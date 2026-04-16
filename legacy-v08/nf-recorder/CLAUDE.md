# nf-recorder — HTML-to-MP4 recorder built on WKWebView frame capture.

## Build
cargo check -p nf-recorder --features cli
cargo test -p nf-recorder --features cli

## Structure
- `src/lib.rs` / `src/main.rs`: shared library API and optional CLI.
- `src/api/`: recording entrypoints and parallel orchestration.
- `src/record/` + `src/webview/`: segment lifecycle, navigation, and frame capture.
- `src/parser/` + `src/plan.rs`: HTML metadata extraction and frame planning.
- `src/encoder/` + `src/overlay/`: H.264 writing, concat, mux, and overlays.

## Rules
- Recorder is frame-accurate: drive pages through `window.__onFrame`, never screen-record.
- AppKit/WebKit work stays on the main thread inside `webview/`, `capture/`, and `record/`.
- Parallel recording belongs in `api::parallel`, not ad hoc spawning.
