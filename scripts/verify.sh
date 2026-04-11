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
  printf -- '- Cargo clippy: %s\n' "$clippy_status"
  printf -- '- Cargo tests: %s passed / %s total\n' "$cargo_tests_passed" "$cargo_tests_total"
  printf -- '- BDD tests: %s passed / %s total\n' "$bdd_passed" "$bdd_total"
  printf -- '- Release build: %s\n\n' "$release_build_status"

  printf '## What works (manual walkthrough)\n'
  printf '%s\n\n' "${manual_notes[0]}"
  printf '1. Open `cargo run -p shell` → a `1440x900` Wry window opens.\n'
  printf '2. The 5-zone CapCut-style layout loads: top menu, left library, center preview, right inspector, bottom timeline.\n'
  printf '3. The preview plays the 30-second demo timeline automatically with the 5 shipped scenes on loop.\n'
  printf '4. Drag a scene from the left library onto `V1` → a clip is created at the drop position.\n'
  printf '5. Drag clip body to move, and drag clip edges to resize.\n'
  printf '6. Press `B` for the Blade tool, then click a clip to split it.\n'
  printf '7. Use `Shift`+click for multi-select, or drag a marquee box on empty timeline space to select multiple clips.\n'
  printf '8. Press `Cmd+Z` to undo the last timeline action.\n'
  printf '9. File → Save prompts for a `.nfproj` path and persists the current timeline.\n'
  printf '10. File → Open loads an existing `.nfproj` file after validation.\n'
  printf '11. File → Export opens the export dialog and can hand off MP4 generation to the recorder subprocess when that binary is available.\n\n'

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
  printf -- '- `cargo test -p bridge`: %s. stdout/stderr summary: %s\n' "$bridge_test_status" "$bridge_test_summary"
  printf -- '- `cargo build --workspace --release`: %s. stdout/stderr summary: %s\n' "$release_build_status" "$release_build_summary"
  printf -- '- `node runtime/web/test/bdd/run.mjs`: %s. stdout/stderr summary: %s\n' "$bdd_status" "$bdd_summary"
} > "$REPORT_PATH"

printf 'Wrote %s and %s\n' "$REPORT_PATH" "$LOG_PATH"
exit 0
