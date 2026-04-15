#!/bin/bash
set -e
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

FAIL=0
LINT_DIRS=(
  src/nf-bridge
  src/nf-cli
  src/nf-core
  src/nf-publish
  src/nf-recorder
  src/nf-runtime
  src/nf-shell-mac
  src/nf-source
  src/nf-tts
)

echo "=== 1. cargo check ==="
cargo check --workspace || FAIL=1

echo "=== 2. cargo test ==="
cargo test --workspace || FAIL=1

echo "=== 3. clippy ==="
cargo clippy --workspace -- -D warnings || FAIL=1

echo "=== 4. prod files >500 lines ==="
OVER=$(find "${LINT_DIRS[@]}" -type f \( -name '*.rs' -o -name '*.js' \) \
  -not -path '*/target/*' -not -path '*/node_modules/*' \
  -not -path '*/.worktrees/*' -not -path '*/poc/*' \
  -not -path '*/output/*' -not -path '*/test*' \
  -not -path '*/.ally/*' -not -name '*-bundle.js' \
  | xargs wc -l 2>/dev/null | awk '$1 > 500 {print}' | grep -v total || true)
if [ -n "$OVER" ]; then echo "FAIL: files >500 lines:" && echo "$OVER"; FAIL=1; else echo "PASS"; fi

echo "=== 5. test files >800 lines ==="
OVER_TEST=$(find "${LINT_DIRS[@]}" -type f \( -name '*test*' -o -name '*tests*' \) \
  \( -name '*.rs' -o -name '*.js' \) \
  -not -path '*/target/*' -not -path '*/node_modules/*' \
  -not -path '*/.ally/*' \
  | xargs wc -l 2>/dev/null | awk '$1 > 800 {print}' | grep -v total || true)
if [ -n "$OVER_TEST" ]; then echo "FAIL: test files >800 lines:" && echo "$OVER_TEST"; FAIL=1; else echo "PASS"; fi

echo "=== 6. JS var usage (source code only, excludes template-generated code) ==="
VAR_COUNT=$(grep -rn '\bvar ' src/nf-runtime/web/js/ --include='*.js' 2>/dev/null | wc -l | tr -d ' ')
if [ "$VAR_COUNT" -gt 0 ]; then echo "FAIL: $VAR_COUNT var usages found in runtime JS"; FAIL=1; else echo "PASS"; fi

echo "=== 7. console.log ==="
LOG_COUNT=$(grep -rn 'console\.log' src/nf-runtime/web/js/ --include='*.js' 2>/dev/null | grep -v '\[bridge\]' | wc -l | tr -d ' ')
if [ "$LOG_COUNT" -gt 0 ]; then echo "FAIL: $LOG_COUNT console.log found"; FAIL=1; else echo "PASS"; fi

echo "=== 8. TODO/FIXME ==="
TODO_COUNT=$(grep -rn -P '//\s*(TODO|FIXME|HACK|XXX)\b|/\*\s*(TODO|FIXME|HACK|XXX)\b' "${LINT_DIRS[@]}" --include='*.rs' --include='*.js' 2>/dev/null | grep -v '/target/' | grep -v '/node_modules/' | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -gt 0 ]; then echo "FAIL: $TODO_COUNT TODO/FIXME found"; FAIL=1; else echo "PASS"; fi

echo "=== 9. scene cross-import ==="
CROSS=$(grep -rn "from.*modules/" src/nf-core/scenes/ --include='*.js' 2>/dev/null || true)
if [ -n "$CROSS" ]; then echo "FAIL: scenes import modules:" && echo "$CROSS"; FAIL=1; else echo "PASS"; fi

echo "=== 10. Cargo.toml deny rules ==="
for RULE in unwrap_used expect_used panic unreachable todo wildcard_imports; do
  if ! grep -q "$RULE.*deny" Cargo.toml 2>/dev/null; then
    echo "FAIL: $RULE not deny in Cargo.toml"; FAIL=1
  fi
done
echo "PASS"

if [ $FAIL -eq 0 ]; then
  echo ""
  echo "ALL CHECKS PASSED"
else
  echo ""
  echo "SOME CHECKS FAILED"
  exit 1
fi
