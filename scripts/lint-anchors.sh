#!/usr/bin/env bash
# Lint v0.8 timeline JSON files: clip.begin/end/at must be anchor refs (strings), not numbers.
# Runs against every timeline.json under spec/projects/ and tmp/ that declares "version": "0.8".
#
# Rules:
#   1. In any v0.8 timeline, clip.begin / clip.end / clip.at / keyframe.at must be a string
#      (anchor ref like "s1.begin" or "s1.end + 0.5s"), NEVER a number literal.
#   2. Top-level "matches" field must not exist (v0.6 residue).
#   3. "version": "0.6" must not exist.
#
# Exit 0 = all pass. Exit 1 = violation found (prints details).

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RESET=$'\033[0m'

violations=0

# Find all v0.8 timelines (search common locations + any tracked json)
candidates=$(git ls-files -- '*.json' 2>/dev/null | xargs grep -l '"version"[[:space:]]*:[[:space:]]*"0.8"' 2>/dev/null || true)

if [ -z "$candidates" ]; then
  echo "${GREEN}[lint-anchors] no v0.8 timelines found (skip)${RESET}"
  exit 0
fi

for file in $candidates; do
  [ -f "$file" ] || continue

  # Rule 2: no top-level "matches" in v0.8
  if python3 -c "
import json, sys
d = json.load(open('$file'))
if isinstance(d, dict) and 'matches' in d:
    sys.exit(1)
sys.exit(0)
" 2>/dev/null; then
    :
  else
    echo "${RED}[lint-anchors] FAIL${RESET} $file — has top-level 'matches' field (v0.6 residue)"
    violations=$((violations + 1))
  fi

  # Rules 1+3: check clip.begin/end/at types and no version 0.6
  python3 - <<PY 2>&1
import json
d = json.load(open("$file"))
errs = []

if d.get("version") == "0.6":
    errs.append("version 0.6 in v0.8 file scan")

for ti, track in enumerate(d.get("tracks", [])):
    kind = track.get("kind", "?")
    for ci, clip in enumerate(track.get("clips", [])):
        for field in ("begin", "end", "at"):
            v = clip.get(field)
            if v is None:
                continue
            if not isinstance(v, str):
                errs.append(f"tracks[{ti}].clips[{ci}].{field} must be anchor ref string, got {type(v).__name__}: {v!r} (kind={kind})")
            elif v.strip() == "":
                errs.append(f"tracks[{ti}].clips[{ci}].{field} is empty string")

        # keyframe.at inside clip.params.*
        params = clip.get("params")
        if isinstance(params, dict):
            for pname, pv in params.items():
                if isinstance(pv, dict) and "keyframes" in pv:
                    for ki, kf in enumerate(pv["keyframes"] or []):
                        if isinstance(kf, dict) and "at" in kf:
                            at = kf["at"]
                            if not isinstance(at, str) or not at.strip():
                                errs.append(f"tracks[{ti}].clips[{ci}].params.{pname}.keyframes[{ki}].at must be anchor ref string, got {at!r}")

if errs:
    import sys
    print("$file")
    for e in errs:
        print(f"  - {e}")
    sys.exit(1)
PY
  if [ $? -ne 0 ]; then
    violations=$((violations + 1))
  fi
done

if [ $violations -gt 0 ]; then
  echo
  echo "${RED}[lint-anchors] FAILED with $violations violation(s)${RESET}"
  echo "Fix: every clip.begin / clip.end / clip.at / keyframe.at must be an anchor reference string (e.g. 's1.begin' or 's1.end + 0.5s'). Numbers are forbidden per ADR-017."
  exit 1
fi

echo "${GREEN}[lint-anchors] ALL PASSED${RESET} (checked $(echo "$candidates" | wc -l | tr -d ' ') v0.8 timeline(s))"
exit 0
