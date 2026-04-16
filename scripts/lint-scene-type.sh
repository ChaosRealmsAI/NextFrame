#!/bin/bash
# lint-scene-type — v1.0 gate: scene.type must be "dom" or "media" (ADR-021).
# Scans all scene .js in src/nf-core/scenes/{16x9,9x16,4x3}/{theme}/; excludes
# _examples/ (recipe templates) and shared/ (tokens).
set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

ALLOWED='"dom"|"media"'
VIOLATIONS=0
SCANNED=0

# shellcheck disable=SC2044
for f in $(find src/nf-core/scenes/16x9 src/nf-core/scenes/9x16 src/nf-core/scenes/4x3 \
  -type f -name '*.js' 2>/dev/null \
  | grep -v '/_examples/' | grep -v '/shared/' | grep -v 'index.js'); do
  SCANNED=$((SCANNED + 1))
  # Grep the first `type:` line in the scene default export (top-level object).
  TYPE_LINE=$(grep -m 1 -E '^\s*type\s*:\s*"[^"]+"\s*,?\s*$' "$f" || true)
  if [ -z "$TYPE_LINE" ]; then
    echo "[lint-scene-type] FAIL: $f missing top-level 'type: \"dom\"|\"media\"'"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi
  if ! echo "$TYPE_LINE" | grep -qE "$ALLOWED"; then
    TYPE_VAL=$(echo "$TYPE_LINE" | sed -E 's/.*type\s*:\s*"([^"]+)".*/\1/')
    echo "[lint-scene-type] FAIL: $f has type=\"$TYPE_VAL\", must be dom|media (ADR-021)"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done

if [ "$VIOLATIONS" -eq 0 ]; then
  echo "[lint-scene-type] ALL PASSED (scanned $SCANNED scene(s))"
  exit 0
else
  echo "[lint-scene-type] $VIOLATIONS violation(s) across $SCANNED scene(s)"
  exit 1
fi
