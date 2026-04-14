# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is NextFrame

AI-native video editor: JSON timeline → multi-layer HTML → browser playback → MP4 recording → multi-platform publishing. Core principle: one visual element = one layer (track). Frame-pure rendering: any frame at time t is computed independently via f(t) → frame.

## Build & Test

```bash
cargo check --workspace          # Rust compilation check (11 crates)
cargo test --workspace           # Rust tests
cargo clippy --workspace -- -D warnings  # Clippy with zero warnings
bash scripts/lint-all.sh         # Full 10-gate lint (check + test + clippy + file size + JS lint)
```

Single crate test: `cargo test -p nf-bridge`

## CLI (primary interface)

```bash
node src/nf-cli/bin/nextframe.js --help      # Full usage guide (workflow, timeline format, layers, animations)
node src/nf-cli/bin/nextframe.js scenes      # List all 40+ scene components with metadata
node src/nf-cli/bin/nextframe.js scenes <id> # Inspect one component (params, types, ranges, defaults)
node src/nf-cli/bin/nextframe.js validate <timeline.json>  # 6 gates + overlap check
node src/nf-cli/bin/nextframe.js build <timeline.json>     # → single-file HTML
node src/nf-cli/bin/nextframe.js preview <timeline.json>   # Screenshots at key times
```

Recording (separate binary): `nextframe-recorder slide <html> --out <mp4> --width 1920 --height 1080 --fps 30 --parallel 8`

## Architecture (two languages, clear boundary)

**JS side** (src/nf-cli/, src/nf-runtime/): timeline editing, scene rendering, HTML generation. Scene components are pure functions: `(ctx, t, params) → canvas draws`. All registered in `src/nf-cli/src/scenes/index.js` with metadata in `meta.js`.

**Rust side** (src/nf-shell, nf-bridge, nf-recorder, nf-tts, nf-publish, src/crates/): desktop shell, IPC, recording, TTS, publishing, source pipeline. All crates communicate via JSON IPC through nf-bridge.

**Data flow**: CLI writes JSON timeline → build bundles into HTML → recorder opens HTML in WKWebView → captures frames → VideoToolbox encodes MP4.

**Source pipeline** (src/crates/nf-*): download (yt-dlp) → transcribe (Whisper) → align (WhisperX) → cut (ffmpeg by sentence-id ranges) → link to project. Canonical data in source.json per source directory.

## Core Rules

- Do not add `unwrap`/`expect`/`panic`; workspace lints deny them. Use `#[allow(...)]` with comment on specific FFI functions only.
- Route all browser/native behavior through `nf-bridge`; no parallel IPC paths.
- Check scene contracts with `nextframe scenes <id>` before guessing timeline params.
- Prod files ≤ 500 lines, test files ≤ 800 lines.
- No `var` in JS (const/let only), no `console.log` in runtime code.
- No TODO/FIXME/HACK/XXX in production code.
- Scenes must not cross-import from modules/ directory.

## Key Paths

- Scene components: `src/nf-cli/src/scenes/` (render fns + meta.js for all param schemas)
- CLI commands: `src/nf-cli/src/commands/` (timeline/, render/, project/, pipeline/, app/)
- IPC dispatch: `src/nf-bridge/src/lib.rs` → `dispatch` / `dispatch_inner`
- Standards: `spec/standards/00-index.md`
- Architecture docs: `spec/architecture/`
- Vision & analysis: `spec/cockpit-app/analysis/`
