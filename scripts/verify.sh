#!/usr/bin/env bash

set +e
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

REPORT_PATH="spec/verify-report.md"
LOG_PATH="spec/verify.log"

mkdir -p spec
: > "$LOG_PATH"

generated_at="$(date '+%Y-%m-%d %H:%M:%S %Z')"
rounds_completed="$(find spec/rounds -maxdepth 1 -type f -name 'R*.md' ! -name '*-reviewer.md' | wc -l | tr -d ' ')"
scene_files="$(ls runtime/web/src/scenes/*.js 2>/dev/null | wc -l | tr -d ' ')"
bdd_test_files="$(ls runtime/web/test/bdd/*.test.js 2>/dev/null | wc -l | tr -d ' ')"

tmp_files=()

cleanup() {
  local file
  for file in "${tmp_files[@]}"; do
    if [ -n "${file:-}" ] && [ -f "$file" ]; then
      rm -f "$file"
    fi
  done
}

trap cleanup EXIT

compact_lines() {
  sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//'
}

summarize_output() {
  local file="$1"
  local summary

  summary="$(
    grep -E 'error(\[|:)|warning:|test result:|Finished|failed|passed|skipped|panicked|Compiling|Checking|Running' "$file" \
      | tail -n 4 \
      | compact_lines \
      | paste -sd ' | ' -
  )"

  if [ -z "$summary" ]; then
    summary="$(
      awk 'NF { gsub(/[[:space:]]+/, " "); sub(/^ /, ""); sub(/ $/, ""); print; count += 1; if (count == 3) exit }' "$file" \
        | paste -sd ' | ' -
    )"
  fi

  if [ -z "$summary" ]; then
    summary="No output captured."
  fi

  printf '%s' "$summary"
}

run_check() {
  local output_file
  output_file="$(mktemp -t nextframe-verify.XXXXXX)" || exit 1
  tmp_files+=("$output_file")

  {
    printf '$'
    local arg
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  } >> "$LOG_PATH"

  "$@" >"$output_file" 2>&1
  RUN_EXIT_CODE="$?"

  cat "$output_file" >> "$LOG_PATH"
  printf '\n[exit %s]\n\n' "$RUN_EXIT_CODE" >> "$LOG_PATH"

  if [ "$RUN_EXIT_CODE" -eq 0 ]; then
    RUN_STATUS="PASS"
  else
    RUN_STATUS="FAIL"
  fi

  RUN_OUTPUT_FILE="$output_file"
  RUN_SUMMARY="$(summarize_output "$output_file")"
}

extract_cargo_test_counts() {
  local file="$1"
  local passed
  local failed
  local ignored
  local measured

  cargo_tests_passed="0"
  cargo_tests_failed="0"
  cargo_tests_total="0"

  while IFS= read -r line; do
    passed="$(printf '%s\n' "$line" | sed -nE 's/.* ([0-9]+) passed;.*/\1/p')"
    failed="$(printf '%s\n' "$line" | sed -nE 's/.* ([0-9]+) failed;.*/\1/p')"
    ignored="$(printf '%s\n' "$line" | sed -nE 's/.* ([0-9]+) ignored;.*/\1/p')"
    measured="$(printf '%s\n' "$line" | sed -nE 's/.* ([0-9]+) measured;.*/\1/p')"

    cargo_tests_passed="$(( cargo_tests_passed + ${passed:-0} ))"
    cargo_tests_failed="$(( cargo_tests_failed + ${failed:-0} ))"
    cargo_tests_total="$(( cargo_tests_total + ${passed:-0} + ${failed:-0} + ${ignored:-0} + ${measured:-0} ))"
  done <<EOF
$(grep -E '^test result:' "$file")
EOF
}

extract_bdd_counts() {
  local file="$1"
  local line
  local passed
  local failed
  local skipped

  line="$(grep -E '([0-9]+ failed, [0-9]+ passed|[0-9]+ passed, 0 failed|[0-9]+ passed, [0-9]+ failed)' "$file" | tail -n 1)"

  bdd_passed="0"
  bdd_failed="0"
  bdd_skipped="0"
  bdd_total="0"
  bdd_result_line=""

  if [ -z "$line" ]; then
    return
  fi

  bdd_result_line="$line"
  passed="$(printf '%s\n' "$line" | grep -Eo '[0-9]+ passed' | head -n 1 | awk '{print $1}')"
  failed="$(printf '%s\n' "$line" | grep -Eo '[0-9]+ failed' | head -n 1 | awk '{print $1}')"
  skipped="$(printf '%s\n' "$line" | grep -Eo '[0-9]+ skipped' | head -n 1 | awk '{print $1}')"

  bdd_passed="${passed:-0}"
  bdd_failed="${failed:-0}"
  bdd_skipped="${skipped:-0}"
  bdd_total="$(( bdd_passed + bdd_failed + bdd_skipped ))"
}

extract_bdd_failures() {
  local file="$1"
  local case_name

  bdd_failed_cases=()

  while IFS= read -r line; do
    case_name="${line#*✗ }"
    if [ -n "$case_name" ]; then
      bdd_failed_cases+=("$case_name")
    fi
  done <<EOF
$(grep -E '^[[:space:]]+✗ ' "$file")
EOF
}

has_needle() {
  local needle="$1"
  local file="$2"
  rg -q --fixed-strings "$needle" "$file"
}

run_check cargo fmt --check
fmt_status="$RUN_STATUS"
fmt_summary="$RUN_SUMMARY"

run_check cargo clippy --workspace --all-targets -- -D warnings
clippy_status="$RUN_STATUS"
clippy_summary="$RUN_SUMMARY"

run_check node runtime/web/test/lint.mjs
web_lint_status="$RUN_STATUS"
web_lint_summary="$RUN_SUMMARY"

run_check cargo test -p bridge
bridge_test_status="$RUN_STATUS"
bridge_test_summary="$RUN_SUMMARY"
extract_cargo_test_counts "$RUN_OUTPUT_FILE"

run_check cargo build --workspace --release
release_build_status="$RUN_STATUS"
release_build_summary="$RUN_SUMMARY"

run_check node runtime/web/test/bdd/run.mjs
bdd_status="$RUN_STATUS"
bdd_summary="$RUN_SUMMARY"
extract_bdd_counts "$RUN_OUTPUT_FILE"
extract_bdd_failures "$RUN_OUTPUT_FILE"
if [ -n "$bdd_result_line" ]; then
  bdd_summary="$bdd_result_line"
fi

manual_notes=()
manual_notes+=("\`verify.sh\` does not launch \`cargo run -p shell\` or the recorder subprocess, so the walkthrough below is source-backed rather than automated UI proof.")

known_issues=()

if [ "$fmt_status" != "PASS" ]; then
  known_issues+=("\`cargo fmt --check\` failed. stdout/stderr summary: $fmt_summary")
fi

if [ "$clippy_status" != "PASS" ]; then
  known_issues+=("\`cargo clippy --workspace --all-targets -- -D warnings\` failed. stdout/stderr summary: $clippy_summary")
fi

if [ "$web_lint_status" != "PASS" ]; then
  known_issues+=("\`node runtime/web/test/lint.mjs\` failed. stdout/stderr summary: $web_lint_summary")
fi

if [ "$bridge_test_status" != "PASS" ]; then
  known_issues+=("\`cargo test -p bridge\` failed. stdout/stderr summary: $bridge_test_summary")
fi

if [ "$release_build_status" != "PASS" ]; then
  known_issues+=("\`cargo build --workspace --release\` failed. stdout/stderr summary: $release_build_summary")
fi

if [ "$bdd_status" != "PASS" ]; then
  known_issues+=("\`node runtime/web/test/bdd/run.mjs\` failed. stdout/stderr summary: $bdd_summary")
fi

if [ "${#bdd_failed_cases[@]}" -gt 0 ]; then
  bdd_failed_cases_summary=""
  for case_name in "${bdd_failed_cases[@]}"; do
    if [ -n "$bdd_failed_cases_summary" ]; then
      bdd_failed_cases_summary="$bdd_failed_cases_summary; "
    fi
    bdd_failed_cases_summary="$bdd_failed_cases_summary$case_name"
  done
  known_issues+=("BDD failing scenarios: $bdd_failed_cases_summary")
fi

if [ "$bdd_skipped" -gt 0 ]; then
  known_issues+=("BDD suite skipped $bdd_skipped scenario(s); this run is not a clean all-green behavioral sweep.")
fi

if has_needle 'tracks: []' runtime/web/src/store.js; then
  known_issues+=("A fresh \`createDefaultTimeline()\` still starts with zero tracks; the 5-scene editor state comes from \`bootstrapDemoTimeline()\` during app init.")
fi

if has_needle 'recorder_not_found' bridge/src/lib.rs; then
  known_issues+=("MP4 export depends on an external recorder/ffmpeg toolchain. The bridge handles a missing recorder gracefully, but end-to-end export still depends on local setup.")
fi

if [ "${#known_issues[@]}" -eq 0 ]; then
  known_issues+=("No command failures in this run. Remaining risk: desktop shell and export flows were intentionally not exercised by automation.")
fi

{
  printf '# NextFrame v0.1 — Overnight Build Verification Report\n\n'
  printf 'Generated: %s\n\n' "$generated_at"
  printf '## Summary\n'
  printf -- '- Rounds completed: %s\n' "$rounds_completed"
  printf -- '- Scene files: %s\n' "$scene_files"
  printf -- '- BDD test files: %s\n' "$bdd_test_files"
  printf -- '- Cargo clippy: %s\n' "$clippy_status"
  printf -- '- Web lint: %s\n' "$web_lint_status"
  printf -- '- Cargo tests: %s passed / %s total\n' "$cargo_tests_passed" "$cargo_tests_total"
  printf -- '- BDD tests: %s passed / %s total\n' "$bdd_passed" "$bdd_total"
  printf -- '- Release build: %s\n\n' "$release_build_status"

  cat <<'EOF'
## Quick Start
```bash
cd NextFrame
cargo run -p shell
```

## Features Shipped
### Phase A: Architecture (R1-R5)
- R1: Initialized the Cargo workspace, four-crate skeleton, and `runtime/web` scaffold.
- R2: Brought up the native Wry/Tao shell window and loaded the local web runtime.
- R3: Added the JSON-style JS↔Rust bridge for filesystem, scene, timeline, and logging calls.
- R4: Built the frame-pure render core, easing helpers, and timeline validation pipeline.
- R5: Ported the first five production scenes and wired the demo timeline into the engine.

### Phase B: UI Shell (R6-R12)
- R6: Replaced the placeholder page with the five-zone editor shell and dark desktop styling.
- R7: Implemented the top menu system plus New/Open/Save/Export project file flows.
- R8: Rendered the multi-track timeline UI with ruler, tracks, clips, zoom, and playhead visuals.
- R9: Mounted the DPR-aware preview canvas with letterboxing, safe areas, and render loop plumbing.
- R10: Shipped the library and inspector panels with live scene data and property editors.
- R11: Bootstrapped autoplay so the app opens with a looping demo timeline instead of a blank screen.
- R12: No standalone round file exists in this repo snapshot; shell work rolled forward into adjacent rounds.

### Phase C: Editing (R13-R19)
- R13: Enabled drag-and-drop from the scene library to create clips directly on timeline tracks.
- R14: Added clip body drag, edge resize, overlap protection, and minimum duration guards.
- R15: Introduced the Blade tool, clip splitting, shift multi-select, and marquee selection.
- R16: Added delete, copy, paste, duplicate, and keyboard shortcuts for core timeline editing.
- R17: Implemented magnetic snapping to grid, playhead, and neighboring clip edges.
- R18: No standalone round file exists; undo-oriented command work landed incrementally in nearby editing rounds.
- R19: No standalone round file exists in this repo snapshot; editing scope continued through later polish rounds.

### Phase D: Preview & Audio (R20-R23)
- R20: No standalone round file exists; playback behavior was delivered across preview bootstrap and transport polish work.
- R21: No standalone round file exists in this repo snapshot; preview/audio scope resumed in R22.
- R22: Added Web Audio mixing, clip waveform rendering, and multi-track playback plumbing.
- R23: Smoothed scrubbing with throttled preview renders and less noisy playhead mutation flow.

### Phase E: Export (R24-R26)
- R24: Exposed the `window.__onFrame` recorder contract for deterministic frame stepping and capture.
- R25: Wired File → Export to a recorder subprocess with presets, progress, and output handoff.
- R26: Added ffmpeg audio muxing so exported MP4 files can include mixed project audio.

### Phase F: Quality (R27-R30)
- R27: Built the headless BDD suite covering critical user scenarios with a custom JS runner.
- R28: Performed the architecture cleanup pass and added file-size checks for oversized modules.
- R29: Closed the lint and warning sweep across Rust and JavaScript quality gates.
- R30: Introduced the overnight verification report and scripted validation pipeline.
- R31: No standalone round file exists in this repo snapshot; numbering resumes at R32 for the polish pass.

### Polish: R32-R59
- R32: Added first-launch polish with the welcome overlay and keyboard hint treatment.
- R33: Expanded the scene library from 5 to 10 reusable frame-pure scenes.
- R34: Documented AI-driven operation and shipped a sample `.nfproj` welcome project.
- R35: Replaced placeholder scene cards with live-rendered library thumbnails.
- R36: Upgraded the preview transport controls with scrub bar, loop toggle, and volume UI.
- R37: Added timeline clip thumbnails so visual clips preview their hero frames inline.
- R38: Shipped an interactive first-run tutorial with anchored tooltips across the editor.
- R39: Added performance telemetry, frame-drop tracking, and a 60fps monitoring hook.
- R40: Added a synced project title bar with filename and dirty-state indicator.
- R41: Added clip color labels and freeform notes in the inspector.
- R42: Added one-click randomized scene params driven by each scene schema.
- R43: Added the project stats strip for clip counts, duration, categories, and dirty state.
- R44: Added toast notifications for save, export, and error feedback.
- R45: Added favorite scenes with persistence and top-of-library prioritization.
- R46: Added a clickable timeline minimap for fast navigation across long projects.
- R47: Added persistent recent files in the File menu via the Rust bridge.
- R48: Added a Cmd+K command palette for keyboard-first control of editor actions.
- R49: Added switchable color themes including the Velvet and Ice presets.
- R50: Added autosave with background snapshots and recovery-oriented bridge endpoints.
- R51: Added a dedicated live-editable text scene for title and overlay work.
- R52: Added project aspect ratio presets for YouTube, TikTok, Instagram, and cinematic output.
- R53: Added the `imageHero` scene with Ken Burns-style motion on still images.
- R54: Made track mute, solo, and lock controls functional in editor state and rendering.
- R55: Added loop-region in/out markers with draggable playback boundaries.
- R56: Added right-click context menus for clips, tracks, and other editor surfaces.
- R57: Added the bottom status bar with cursor time, tool state, selection, and autosave status.
- R58: Added the `shapeBurst` motion graphics scene for geometric burst animation.
- R59: Added the `fluidBackground` scene for animated soft-glow abstract backdrops.

## Try It Now
1. `cd NextFrame`
2. `cargo run -p shell`
3. The window opens, scenes auto-play
4. Press `Cmd+K` to open the command palette.
5. Press `B` for blade tool, click a clip to split
6. Try `View > Theme > Velvet` for purple aesthetic
7. `File > Export` to start to render MP4

EOF

  printf '## What works (manual walkthrough)\n'
  printf '%s\n\n' "${manual_notes[0]}"
  printf '1. Launch `cargo run -p shell` and let the `1440x900` Wry window settle on the autoplaying demo timeline.\n'
  printf '2. Call out the editor shell: top menu, scene library, preview canvas, inspector, and multi-track timeline.\n'
  printf '3. Show that scenes are live by dragging a library card onto `V1`, then move and resize the created clip.\n'
  printf '4. Press `B`, split a clip, then use `Shift`+click or a marquee drag to show multi-select editing.\n'
  printf '5. Hit `Cmd+K` for the command palette and switch `View > Theme > Velvet` to show the polished shell variants.\n'
  printf '6. Open File actions to show Save/Open, recent files, autosave support, and export entry points.\n'
  printf '7. Finish in the timeline: loop a region, inspect clip params, and point out thumbnails, stats, and status feedback.\n'
  printf '8. Start File → Export and explain that MP4 output works when the recorder and ffmpeg toolchain are installed.\n\n'

  printf '## Known issues / gaps\n'
  local_issue_index=0
  while [ "$local_issue_index" -lt "${#known_issues[@]}" ]; do
    printf -- '- %s\n' "${known_issues[$local_issue_index]}"
    local_issue_index="$(( local_issue_index + 1 ))"
  done
  printf '\n'

  printf '## What'\''s NOT implemented (out of scope)\n'
  printf -- '- Transitions library\n'
  printf -- '- Effect stack on clips\n'
  printf -- '- Audio envelope editing\n'
  printf -- '- Cross-platform (macOS only)\n\n'

  printf '## Verification command summaries\n'
  printf -- '- `cargo fmt --check`: %s. stdout/stderr summary: %s\n' "$fmt_status" "$fmt_summary"
  printf -- '- `cargo clippy --workspace --all-targets -- -D warnings`: %s. stdout/stderr summary: %s\n' "$clippy_status" "$clippy_summary"
  printf -- '- `node runtime/web/test/lint.mjs`: %s. stdout/stderr summary: %s\n' "$web_lint_status" "$web_lint_summary"
  printf -- '- `cargo test -p bridge`: %s. stdout/stderr summary: %s\n' "$bridge_test_status" "$bridge_test_summary"
  printf -- '- `cargo build --workspace --release`: %s. stdout/stderr summary: %s\n' "$release_build_status" "$release_build_summary"
  printf -- '- `node runtime/web/test/bdd/run.mjs`: %s. stdout/stderr summary: %s\n' "$bdd_status" "$bdd_summary"
  printf '\n## Inventory Counts\n'
  printf -- '- Scene files (`runtime/web/src/scenes/*.js`): %s\n' "$scene_files"
  printf -- '- BDD test files (`runtime/web/test/bdd/*.test.js`): %s\n' "$bdd_test_files"
} > "$REPORT_PATH"

printf 'Wrote %s and %s\n' "$REPORT_PATH" "$LOG_PATH"
exit 0
