#!/bin/bash
# lint-scene-exclude-examples — v1.0 gate: _examples/ is NOT a real theme directory.
# Verifies: (a) index.js does not index _examples/; (b) _examples/ files follow the
# same contract (type, render signature) so they can serve as recipe templates.
set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

VIOLATIONS=0

# 1. index.js must not reference _examples/ as a theme.
if grep -qE '_examples' src/nf-core/scenes/index.js 2>/dev/null; then
  echo "[lint-scene-exclude-examples] FAIL: src/nf-core/scenes/index.js references _examples/ (must be excluded from scene registry)"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# 2. _examples/ directory exists and contains at least 1 dom + 1 media seed.
if [ ! -d "src/nf-core/scenes/_examples" ]; then
  echo "[lint-scene-exclude-examples] FAIL: src/nf-core/scenes/_examples/ missing (v1.0 requires dom + media seeds)"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  EXAMPLE_COUNT=$(find src/nf-core/scenes/_examples -type f -name '*.js' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$EXAMPLE_COUNT" -lt 2 ]; then
    echo "[lint-scene-exclude-examples] FAIL: _examples/ has $EXAMPLE_COUNT .js, expected >=2 (1 dom + 1 media seed)"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
fi

# 3. _examples files must still follow type+render contract (so recipe can show them as templates).
# Run the same checks via lint-scene-type + lint-scene-render-arity — they now include _examples/.
# (Both scripts already scan _examples/ — this file's job is structural integrity above.)

if [ "$VIOLATIONS" -eq 0 ]; then
  echo "[lint-scene-exclude-examples] ALL PASSED"
  exit 0
else
  echo "[lint-scene-exclude-examples] $VIOLATIONS violation(s)"
  exit 1
fi
