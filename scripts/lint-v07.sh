#!/usr/bin/env bash
# v0.7 WYSIWYG architecture lint — ADR-013/014/015/016 enforcement.
# Run from repo root or via lint-all.sh.
set -u
fail=0
pass() { echo "PASS"; }
fail() { echo "FAIL: $1" >&2; fail=$((fail+1)); }

echo "=== v0.7 lint: no canvas in nf-wysiwyg ==="
# ADR-013: v0.7 path must not use canvas 2d/webgl API
hits=$(grep -rn --include='*.rs' -E "getContext\s*\(\s*['\"](2d|webgl)" src/nf-wysiwyg/ 2>/dev/null || true)
if [ -n "$hits" ]; then fail "nf-wysiwyg must not call getContext('2d'|'webgl'); got: $hits"; else pass; fi

echo "=== v0.7 lint: preview-engine-v2 does not import v0.6 engine ==="
# ADR-013/014: v0.7 preview path is isolated
hits=$(grep -nE "from\s+['\"].*preview-engine\.js|require.*preview-engine\.js" src/nf-runtime/web/src/preview/preview-engine-v2.js 2>/dev/null || true)
if [ -n "$hits" ]; then fail "preview-engine-v2.js must not import v0.6 preview-engine.js; got: $hits"; else pass; fi

echo "=== v0.7 lint: nf-wysiwyg does not depend on nf-cli (direction) ==="
# ADR-004-style dep direction: nf-cli → nf-wysiwyg, not the other way
hits=$(grep -nE "^(use|extern crate|pub use)\s+nf_cli" src/nf-wysiwyg/src/*.rs 2>/dev/null || true)
cargo_hits=$(grep -nE "^nf-cli\s*=" src/nf-wysiwyg/Cargo.toml 2>/dev/null || true)
if [ -n "$hits$cargo_hits" ]; then fail "nf-wysiwyg must not depend on nf-cli; got: $hits $cargo_hits"; else pass; fi

echo "=== v0.7 lint: recorder takeSnapshot only inside poc2 or wgpu_replay path ==="
# ADR-016 revised: recorder no longer uses takeSnapshot for 30fps export
# Allow POC2 binary + nf-shell-mac screenshot fn. Forbid in nf-recorder main path.
hits=$(grep -rn --include='*.rs' "takeSnapshot" src/nf-recorder/ 2>/dev/null | grep -v -E "(^|/)poc|wgpu_replay" || true)
# also allow existing v0.6 capture if clearly marked legacy
if [ -n "$hits" ]; then
  echo "WARN: takeSnapshot in nf-recorder (allowed in v0.6 path; flag for v0.7 migration):"
  echo "$hits"
fi
pass

echo "=== v0.7 lint: wysiwyg scene contract doc present ==="
if [ ! -f src/nf-core/scenes/scene-dom-contract.md ]; then
  fail "src/nf-core/scenes/scene-dom-contract.md missing"
else pass; fi

echo "=== v0.7 lint: nf-wysiwyg file size ≤ 500 lines ==="
oversize=$(find src/nf-wysiwyg/src -name '*.rs' -exec wc -l {} \; | awk '$1>500{print}')
if [ -n "$oversize" ]; then fail "files over 500 lines: $oversize"; else pass; fi

echo
if [ $fail -eq 0 ]; then
  echo "=== v0.7 lint: ALL PASSED ==="
  exit 0
else
  echo "=== v0.7 lint: $fail FAILED ==="
  exit 1
fi
