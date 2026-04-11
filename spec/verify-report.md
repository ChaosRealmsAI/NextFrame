# NextFrame v0.1 — Overnight Build Verification Report

Generated: 2026-04-12 05:49:39 CST

## Summary
- Rounds completed: 50
- Cargo clippy: PASS
- Web lint: PASS
- Cargo tests: 35 passed / 35 total
- BDD tests: 31 passed / 34 total
- Release build: PASS

## What works (manual walkthrough)
`verify.sh` does not launch `cargo run -p shell` or the recorder subprocess, so the walkthrough below is source-backed rather than automated UI proof.

1. Open `cargo run -p shell` → a `1440x900` Wry window opens.
2. The 5-zone CapCut-style layout loads: top menu, left library, center preview, right inspector, bottom timeline.
3. The preview plays the 30-second demo timeline automatically with the 5 shipped scenes on loop.
4. Drag a scene from the left library onto `V1` → a clip is created at the drop position.
5. Drag clip body to move, and drag clip edges to resize.
6. Press `B` for the Blade tool, then click a clip to split it.
7. Use `Shift`+click for multi-select, or drag a marquee box on empty timeline space to select multiple clips.
8. Press `Cmd+Z` to undo the last timeline action.
9. File → Save prompts for a `.nfproj` path and persists the current timeline.
10. File → Open loads an existing `.nfproj` file after validation.
11. File → Export opens the export dialog and can hand off MP4 generation to the recorder subprocess when that binary is available.

## Known issues / gaps
- BDD suite skipped 3 scenario(s); this run is not a clean all-green behavioral sweep.

## What's NOT implemented (out of scope)
- Transitions library
- Effect stack on clips
- Audio envelope editing
- Cross-platform (macOS only)

## Verification command summaries
- `cargo fmt --check`: PASS. stdout/stderr summary: No output captured.
- `cargo clippy --workspace --all-targets -- -D warnings`: PASS. stdout/stderr summary:    Finished `dev` profile [unoptimized  debuginfo] target(s) in 0.10s
- `node runtime/web/test/lint.mjs`: PASS. stdout/stderr summary: Checked 72 JavaScript file(s) under runtime/web/src with 0 TODO warning(s).
- `cargo test -p bridge`: PASS. stdout/stderr summary:    Finished `test` profile [unoptimized  debuginfo] target(s) in 0.06s     Running unittests src/lib.rs (target/debug/deps/bridge-2a4fbf10d9d5756b)|test result: ok. 35 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
- `cargo build --workspace --release`: PASS. stdout/stderr summary:    Finished `release` profile [optimized] target(s) in 0.07s
- `node runtime/web/test/bdd/run.mjs`: PASS. stdout/stderr summary: ✓ 31 passed, 0 failed, 3 skipped
