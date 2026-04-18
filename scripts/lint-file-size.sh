#!/usr/bin/env bash
# Scan src/**/*.{rs,ts,js,mjs} line counts.
# Product code: > 500 lines → FAIL.
# Test code (tests/ dir or *_test.*): > 800 lines → FAIL.
# Output JSON lines per violation + final summary JSON.
set -euo pipefail

cd "$(dirname "$0")/.."

files_tmp="$(mktemp)"
violations_tmp="$(mktemp)"
trap 'rm -f "$files_tmp" "$violations_tmp"' EXIT

if [ -d src ]; then
  find src \
    -type d \( -name target -o -name node_modules -o -name dist -o -name legacy-v08 \) -prune -o \
    -type f \( -name '*.rs' -o -name '*.js' -o -name '*.ts' -o -name '*.mjs' \) -print \
    >> "$files_tmp"
fi

scanned=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  scanned=$((scanned + 1))
  lines="$(wc -l < "$file" | tr -d ' ')"

  # Decide limit: test files → 800, product → 500.
  limit=500
  case "$file" in
    */tests/*|*/test/*|*_test.rs|*_test.ts|*_test.js|*.test.ts|*.test.js)
      limit=800
      ;;
  esac

  if [ "$lines" -gt "$limit" ]; then
    # Emit one JSON line per violation.
    printf '{"event":"lint-file-size.violation","file":"%s","lines":%s,"limit":%s}\n' \
      "$file" "$lines" "$limit"
    printf '%s\n' "$file" >> "$violations_tmp"
  fi
done < "$files_tmp"

violation_count=$(wc -l < "$violations_tmp" | tr -d ' ')
if [ "$violation_count" -eq 0 ]; then
  printf '{"event":"lint-file-size.done","files_scanned":%s,"violations":0}\n' "$scanned"
  exit 0
else
  printf '{"event":"lint-file-size.done","files_scanned":%s,"violations":%s}\n' \
    "$scanned" "$violation_count"
  exit 1
fi
