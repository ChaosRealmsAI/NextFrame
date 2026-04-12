# A-wry-snapshot Report

- Render time: `658.50 ms` for `cargo run --release -- 5.0` after the release binary was already built.
- Total LOC: `386` (`Cargo.toml` + `src/main.rs`).
- Output: `frame_t5.png` verified as a valid `1920x1080` PNG.

## Setup

- No workspace crates are used.
- Standard Cargo flow only:
  - `cargo run --release -- 5.0`
- Cargo will fetch crates from crates.io on first build.

## Gotchas

- A fully hidden macOS `WKWebView` would not reliably advance page rendering or the JS frame handshake. The working approach is an offscreen, unfocused `tao` window with `ActivationPolicy::Accessory`, so nothing user-facing opens while WebKit still renders.
- `WKWebView::takeSnapshot` on Retina displays produced a `3840x2160` PNG for a `1920x1080` view. The binary now normalizes the snapshot back to exactly `1920x1080` before writing `frame_t5.png`.
- Loading the bootstrap page through a `wry` custom protocol was more reliable than `file://` for the relative `../auroraGradient.js` module import and kept the whole POC self-contained.
