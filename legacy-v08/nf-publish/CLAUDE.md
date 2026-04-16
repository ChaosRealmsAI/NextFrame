# nf-publish — Native macOS publisher that automates creator portals in WKWebView tabs.

## Build
cargo check -p nf-publish
cargo test -p nf-publish

## Structure
- `src/main.rs`: app boot, WebKit setup, and persistent data store.
- `src/commands/` + `src/keyboard/`: command parsing and native input primitives.
- `src/state/`: tab registry, persistence, navigation, and session checks.
- `src/ui/` + `src/delegates.rs`: window chrome and WKWebView delegates.
- `src/polling.rs` + `src/eval.rs`: command-file loop and JS evaluation helpers.

## Rules
- User-visible actions go through native `NSEvent`; JS is only for read/locate/file-dialog work.
- Keep per-tab command, result, and screenshot paths aligned with `state/`.
- Preserve platform-domain isolation and the fixed persistent data-store setup in `main.rs`.
