# W-3 Report · app shell

## Scope

- Implemented real `tao` app loop and `wry` WebView windows in `nf-shell`.
- Added `WindowManager` with project/episode reuse, `--new-window`, close, close-by-OS-event, list, and quit-all behavior.
- Added app IPC handlers for `open`, `ps`, `close`, `quit`, `screenshot`, `click`, `state`, and `devtools`.
- Wired `nf-cli` app commands to shell IPC, including dedicated `devtools-query`.
- Added file-backed v0.2 stub HTML bundle. It has `.app` backdrop filtering and `.topbar` without backdrop filtering, matching the P-01 finding.
- Added in-process PNG writer for `nf screenshot`; no host `screencapture` is used.

## Files

- `crates/nf-shell/src/window_manager.rs`
- `crates/nf-shell/src/webview.rs`
- `crates/nf-shell/src/handlers/app.rs`
- `crates/nf-shell/src/handlers/mod.rs`
- `crates/nf-shell/src/main.rs`
- `crates/nf-shell/src/events.rs`
- `crates/nf-shell/src/ipc_server.rs`
- `crates/nf-cli/src/commands/app.rs`
- `crates/nf-shell/Cargo.toml`
- `crates/nf-shell/src/lib.rs`

## Verification

Commands passed:

```sh
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
cargo build --bin nf
```

Real shell e2e:

```sh
cargo run --bin nf-shell
./target/debug/nf open --project=demo --episode=ep-01
./target/debug/nf ps --project=demo --episode=ep-01
./target/debug/nf screenshot --project=demo --episode=ep-01 --region=topbar --out=tmp/w3-topbar.png
file tmp/w3-topbar.png
./target/debug/nf click --project=demo --episode=ep-01 --selector='body'
./target/debug/nf devtools --project=demo --episode=ep-01 --query='.app' --get='computed-style:-webkit-backdrop-filter'
./target/debug/nf devtools --project=demo --episode=ep-01 --query='.topbar' --get='computed-style:-webkit-backdrop-filter'
./target/debug/nf close --project=demo --episode=ep-01
./target/debug/nf ps --project=demo --episode=ep-01
./target/debug/nf quit
test ! -e /tmp/nextframe-$(id -u).sock
```

Observed results:

- `open` returned `{"window_id":"w-1"}` and opened a real Mac window.
- First cold e2e command measurement was `0.57s`; a fresh shell after the stub bundle existed measured `0.08s`.
- `ps` returned one window before close and zero windows after close while shell stayed alive.
- `tmp/w3-topbar.png` is a real PNG: `PNG image data, 1440 x 52, 8-bit/color RGBA, non-interlaced`.
- `click --selector='body'` returned `ok:true`.
- `.app` computed `-webkit-backdrop-filter` returned `blur(50px) saturate(1.5)`.
- `.topbar` computed `-webkit-backdrop-filter` returned `none`.
- `quit` returned `{"quit":true}` and `/tmp/nextframe-$(id -u).sock` was removed.

## Notes

- `wry` DPR is forced to `1` in the stub probe path for v0.2, matching the W-3 constraint.
- Screenshot output is generated inside `nf-shell` from WebView-evaluated geometry and a PNG encoder. It is not a host screen capture.
- No git commit was made.
