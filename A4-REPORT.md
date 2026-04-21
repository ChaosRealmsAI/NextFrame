# A4 Report - `nf capture` native window screenshot

## Changed Files

- `crates/nf-shell/src/capture.rs`
  - New macOS CoreGraphics/ImageIO native capture module.
  - Uses raw `extern "C"` FFI for `CGWindowListCreateImage`, `CGImageDestinationCreateWithURL`, and CoreFoundation URL/String/release calls.
  - Uses `CGRectNull`, `kCGWindowListOptionIncludingWindow`, and `kCGWindowImageBestResolution`.
  - Does not set `kCGWindowImageBoundsIgnoreFraming`, so the output includes native framing/shadow.
  - Non-macOS path returns `unsupported platform: nf capture requires macOS CoreGraphics`.
- `crates/nf-shell/src/window_manager.rs`
  - Tracks native macOS `NSWindow.windowNumber` by logical `w-*` id.
  - Adds focused-window-first capture target lookup.
  - Activates/focuses the app before capture.
  - Adds `capture_missing_window_reports_error` unit test.
- `crates/nf-shell/src/events.rs`, `ipc_server.rs`, `main.rs`, `handlers/app.rs`, `lib.rs`
  - Adds `CaptureWindow` event, `"capture"` IPC dispatch, and app handler wiring.
- `crates/nf-cli/src/commands/mod.rs`, `commands/app.rs`, `main.rs`
  - Adds `nf capture --project --episode --out [--window-id]`.

## Tests Added

- `capture::tests::capture_png_magic_bytes`
- `window_manager::tests::capture_missing_window_reports_error`

## Verification

```sh
cargo check --workspace
# Finished `dev` profile ... no warnings

RUSTFLAGS="-D warnings" cargo check --workspace
# Finished `dev` profile ... no warnings

cargo clippy --workspace -- -D warnings
# Finished `dev` profile ... no warnings

cargo test --workspace --lib
# nf-cli: 6 passed
# nf-shell: 22 passed
# total: 28 passed

cargo build --release --bins
# Finished `release` profile
```

## E2E

```sh
HOME="$PWD/tmp/a4" ./target/release/nf-shell
# {"event":"ready","bin":"nf-shell","version":"0.2.0","sock":"/tmp/nextframe-502.sock"}

HOME="$PWD/tmp/a4" ./target/release/nf projects create --slug=a4-demo --name='A4'
# {"created":"2026-04-21T10:47:14Z","name":"A4","path":".../tmp/a4/.nextframe/a4-demo/project.json","slug":"a4-demo"}

HOME="$PWD/tmp/a4" ./target/release/nf episodes create --project=a4-demo --slug=ep-01 --duration=10
# {"created":"2026-04-21T10:47:21Z","duration":10.0,"name":"ep-01","path":".../tmp/a4/.nextframe/a4-demo/episodes/ep-01.json","slug":"ep-01"}

HOME="$PWD/tmp/a4" ./target/release/nf open --project=a4-demo --episode=ep-01
# {"episode":"ep-01","pid":23106,"project":"a4-demo","window_id":"w-1"}

HOME="$PWD/tmp/a4" ./target/release/nf capture --project=a4-demo --episode=ep-01 --out=tmp/a4-cap.png
# {"bytes":729392,"height":1936,"out":"tmp/a4-cap.png","width":3016,"window_id":"w-1","window_number":4228}
```

```sh
file tmp/a4-cap.png
# tmp/a4-cap.png: PNG image data, 3016 x 1936, 8-bit/color RGBA, non-interlaced

sips -g pixelWidth -g pixelHeight tmp/a4-cap.png
# pixelWidth: 3016
# pixelHeight: 1936

xxd -l 16 tmp/a4-cap.png
# 8950 4e47 0d0a 1a0a ... IHDR

shasum -a 256 tmp/a4-cap.png
# 245d4c05d046f948a9259210c317bb71e81bd67c265385203586220de116656a
```

## Visual Read

`tmp/a4-cap.png` is a native full-window capture, not DOM-only content. The image includes the rounded macOS window, shadow/framing, top-left traffic-light controls, and the NextFrame topbar/content.

No git commit was made.
