#!/bin/bash
# lint-scene-render-arity — v1.0 gate: scene.render signature must be (t, params, vp).
# Uses grep heuristic (not AST) — looks for `render(` call pattern and counts commas.
# 4-arg signature (host, t, params, vp) is the pre-v0.9.3 legacy and MUST NOT reappear.
set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

VIOLATIONS=0
SCANNED=0

# shellcheck disable=SC2044
for f in $(find src/nf-core/scenes/16x9 src/nf-core/scenes/9x16 src/nf-core/scenes/4x3 \
  src/nf-core/scenes/_examples \
  -type f -name '*.js' 2>/dev/null \
  | grep -v '/shared/' | grep -v 'index.js'); do
  SCANNED=$((SCANNED + 1))
  # Find lines like `render(t, params, vp)` or `render: function(t, params, vp)`.
  # Reject lines where the render callback has 4 args matching (host, t, params, vp).
  SIG=$(grep -m 1 -E 'render\s*[\(:]|render\s*=\s*function\s*\(' "$f" | head -1 || true)
  if [ -z "$SIG" ]; then
    echo "[lint-scene-render-arity] FAIL: $f missing render function"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi
  # Extract the arg list inside the first `render(...)` parens.
  ARGS=$(echo "$SIG" | sed -nE 's/.*render\s*\(\s*([^)]*)\).*/\1/p' | head -1)
  if [ -z "$ARGS" ]; then
    # render might be a property shorthand `render(t, params, vp) {` — get next line.
    ARGS=$(awk "/render\s*\(/{flag=1} flag{print; if(/\)/){exit}}" "$f" | tr '\n' ' ' | sed -nE 's/.*render\s*\(([^)]*)\).*/\1/p' | head -1)
  fi
  ARG_COUNT=$(echo "$ARGS" | awk -F',' '{print NF}')
  # Acceptable: 3 args (t, params, vp). Some scenes use (_t, ...) or (t, params, _vp) — still 3.
  if [ "$ARG_COUNT" -ne 3 ]; then
    echo "[lint-scene-render-arity] FAIL: $f render has $ARG_COUNT args ('$ARGS'), expected 3 (t, params, vp)"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done

if [ "$VIOLATIONS" -eq 0 ]; then
  echo "[lint-scene-render-arity] ALL PASSED (scanned $SCANNED scene(s))"
  exit 0
else
  echo "[lint-scene-render-arity] $VIOLATIONS violation(s) across $SCANNED scene(s)"
  exit 1
fi
