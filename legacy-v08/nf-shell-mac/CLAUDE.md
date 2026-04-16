# nf-shell-mac — macOS native desktop shell using objc2 + AppKit + WKWebView.

## Build
```bash
cargo check -p nf-shell-mac
cargo clippy -p nf-shell-mac -- -D warnings
```

## Structure
- `src/main.rs` — entry point, app lifecycle
- `src/app.rs` — NSApplication boot + NSWindow creation + run loop
- `src/window.rs` — window drag bridge, traffic light positioning, resize observer
- `src/verify.rs` — self-verification (--verify) and eval-script (--eval-script) modes
- `src/webview.rs` — WKWebView configuration, navigation, content loading
- `src/ipc.rs` — JavaScript <-> Rust message bridge (postMessage / evaluateJavaScript)
- `src/protocol.rs` — custom URL scheme handler for local file serving

## Rules
- All browser/native behavior routes through `nf-bridge` IPC; no parallel IPC paths.
- Use `#[allow(clippy::unwrap_used)]` only on FFI boundary functions, with a comment explaining why.
- No `unwrap()`/`expect()`/`panic!()` in non-FFI code; workspace lints deny them.
- Keep file under 500 lines; extract window-management helpers when approaching limit.
