#!/usr/bin/env bash
# TS/JS boundary lint — prevents the drift that caused v0.5 regression.
#
# 4 rules:
#   1. No same-stem .ts/.js duplicate anywhere in src/
#   2. JS-only zones (web/src, scenes, animation effects/transitions/filters)
#      must not contain .ts files (except .d.ts).
#   3. TS-authoritative zones (nf-cli/src, nf-cli/test, nf-core/engine)
#      must not contain .js files.
#   4. Every <script src="*.js"> in index.html must resolve to an existing file.
#
# Exit non-zero on any violation. Called from scripts/lint-all.sh.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0
red() { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }

# Rule 1: no same-stem .ts/.js duplicate
dupes=$(find src -type f \( -name "*.ts" -o -name "*.js" \) ! -name "*.d.ts" \
  | sed 's/\.[jt]s$//' | sort | uniq -d)
if [ -n "$dupes" ]; then
  red "[lint-boundary] rule 1 FAIL: same-stem .ts/.js duplicates:"
  echo "$dupes"
  FAIL=1
fi

# Rule 2: JS-only zones must not have .ts (except .d.ts)
JS_ZONES=(
  "src/nf-runtime/web/src"
  "src/nf-core/scenes"
  "src/nf-core/animation/effects"
  "src/nf-core/animation/transitions"
  "src/nf-core/filters"
)
for z in "${JS_ZONES[@]}"; do
  [ -d "$z" ] || continue
  bad=$(find "$z" -type f -name "*.ts" ! -name "*.d.ts" 2>/dev/null)
  if [ -n "$bad" ]; then
    red "[lint-boundary] rule 2 FAIL: .ts in JS-only zone $z:"
    echo "$bad"
    FAIL=1
  fi
done

# Also check standalone shared.ts files in animation root
for f in src/nf-core/animation/shared.ts src/nf-core/animation/canvasCompat.ts; do
  if [ -f "$f" ]; then
    red "[lint-boundary] rule 2 FAIL: $f must be .js (browser-inline)"
    FAIL=1
  fi
done

# Rule 3: TS-authoritative zones must not have .js (except declared exceptions)
TS_ZONES=(
  "src/nf-cli/src"
  "src/nf-cli/test"
  "src/nf-core/engine"
)
for z in "${TS_ZONES[@]}"; do
  [ -d "$z" ] || continue
  bad=$(find "$z" -type f -name "*.js" 2>/dev/null)
  if [ -n "$bad" ]; then
    red "[lint-boundary] rule 3 FAIL: .js in TS-authoritative zone $z:"
    echo "$bad"
    FAIL=1
  fi
done

# Rule 4: index.html <script src=> must exist
HTML="src/nf-runtime/web/index.html"
if [ -f "$HTML" ]; then
  missing=$(grep -oE 'src="src/[^"]+\.js"' "$HTML" | sed 's/src="//; s/"$//' | while read p; do
    [ -f "src/nf-runtime/web/$p" ] || echo "$p"
  done)
  if [ -n "$missing" ]; then
    red "[lint-boundary] rule 4 FAIL: index.html references missing scripts:"
    echo "$missing"
    FAIL=1
  fi
fi

if [ $FAIL -eq 0 ]; then
  green "[lint-boundary] ALL PASSED (4 rules)"
  exit 0
fi
exit 1
