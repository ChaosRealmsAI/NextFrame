# Task — R30: End-to-end verify report

## Goal
Produce a single-file `spec/verify-report.md` that walks through the product state as it exists right now, documents what works, what doesn't, and produces a "morning demo" walkthrough. This is the capstone report for the overnight build.

## Requirements

### Verification script (`scripts/verify.sh`)
- Bash script that runs:
  - `cargo fmt --check`
  - `cargo clippy --workspace --all-targets -- -D warnings`
  - `cargo test -p bridge`
  - `cargo build --workspace --release` (produces release binary)
  - `node runtime/web/test/bdd/run.mjs` (may have pending failures)
  - For each, record PASS/FAIL + stdout/stderr summary
- Output `spec/verify-report.md` in this format:
  ```
  # NextFrame v0.1 — Overnight Build Verification Report

  Generated: {date}

  ## Summary
  - Rounds completed: {N}
  - Cargo clippy: {PASS|FAIL}
  - Cargo tests: {N passed / M total}
  - BDD tests: {N passed / M total}
  - Release build: {PASS|FAIL}

  ## What works (manual walkthrough)
  1. Open `cargo run -p shell` → a 1440x900 window opens
  2. The 5-zone CapCut-style layout loads: top menu, left library, center preview, right inspector, bottom timeline
  3. The preview plays the 30-second demo timeline automatically (5 scenes on loop)
  4. Drag a scene from the left library onto V1 → clip created at drop position
  5. Drag clip body to move, edges to resize
  6. Press `B` for Blade tool, click a clip to split it
  7. Shift+click for multi-select, marquee drag for box select
  8. Cmd+Z undoes the last action
  9. File → Save → prompts for .nfproj path
  10. File → Open → load an .nfproj file
  11. File → Export → dialog → produces MP4 via recorder subprocess

  ## Known issues / gaps
  - {list any failing tests, missing features, rough edges}

  ## What's NOT implemented (out of scope)
  - Transitions library
  - Effect stack on clips
  - Audio envelope editing
  - Cross-platform (macOS only)
  ```

### Script output path
- `scripts/verify.sh` writes to `spec/verify-report.md`
- Also writes `spec/verify.log` with full command output

## Technical Constraints
- Bash, no Python
- Exit 0 even if some checks fail (this is a report, not a gate)
- Do NOT run `cargo run` (that'd hang waiting for window close)
- Do NOT run recorder subprocess

## Verification Commands
```bash
test -f scripts/verify.sh
bash scripts/verify.sh
test -f spec/verify-report.md
grep -q 'Cargo clippy' spec/verify-report.md
grep -q 'BDD tests' spec/verify-report.md
grep -q 'manual walkthrough' spec/verify-report.md
```

## Non-Goals
- NO automated UI testing (too fragile for 1-round attempt)
- NO regression fixes
