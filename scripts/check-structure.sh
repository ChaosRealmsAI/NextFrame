#!/usr/bin/env bash
# NextFrame repository skeleton gate.
# Keeps product source separate from generated artifacts, local archives, and nested repos.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

failures=0

fail() {
  failures=$((failures + 1))
  echo "FAIL: $*" >&2
}

note() {
  echo "OK: $*"
}

case " $* " in
  *" --help "*|*" -h "*)
    cat <<'EOF'
Usage: ./scripts/check-structure.sh

Checks:
  - no nested spec git repository
  - no root tmp/episodes/reference/archive/.autopilot/.worktrees directories
  - root directories stay in the product skeleton allowlist
  - tracked files do not include generated media or build artifacts
  - tracked files do not exceed 50MB
EOF
    exit 0
    ;;
esac

if [ -d spec/.git ]; then
  fail "spec/.git exists; spec must be tracked by the main repository"
else
  note "spec is not a nested git repository"
fi

if git ls-files --error-unmatch spec/devlog/02.md >/dev/null 2>&1 &&
   git ls-files --error-unmatch spec/bdd/repo-skeleton-governance/feature.json >/dev/null 2>&1; then
  note "spec is tracked by the main repository"
else
  fail "spec files are not tracked by the main repository"
fi

for dir in tmp episodes reference archive .autopilot .worktrees node_modules; do
  if [ -e "$dir" ]; then
    fail "root $dir/ exists; move local artifacts to ../NextFrame.archive/"
  fi
done

allowed=" .git .github .claude crates examples frontend scripts spec target tests "
for dir in */ .*/; do
  dir="${dir%/}"
  [ "$dir" = "." ] && continue
  [ "$dir" = ".." ] && continue
  case "$allowed" in
    *" $dir "*) ;;
    *) fail "unexpected root directory: $dir" ;;
  esac
done

tracked_bad=$(
  git ls-files | while IFS= read -r file; do
    [ -e "$file" ] || continue
    if [[ "$file" == tmp/* ]] ||
       [[ "$file" == episodes/* ]] ||
       [[ "$file" == reference/* ]] ||
       [[ "$file" == archive/* ]] ||
       [[ "$file" == target/* ]] ||
       [[ "$file" == node_modules/* ]] ||
       [[ "$file" == .autopilot/* ]] ||
       [[ "$file" == .worktrees/* ]] ||
       [[ "$file" == */node_modules/* ]] ||
       [[ "$file" == */target/* ]] ||
       [[ "$file" == frontend/nf-components/tmp-w4/* ]] ||
       [[ "$file" =~ ^spec/.*/(dist|screenshots|audio)/ ]] ||
       [[ "$file" == *.mp4 ]] ||
       [[ "$file" == *.mp3 ]] ||
       [[ "$file" == *.wav ]] ||
       [[ "$file" == *.png ]] ||
       [[ "$file" == *.jpg ]] ||
       [[ "$file" == *.jpeg ]] ||
       [[ "$file" == *.webm ]] ||
       [[ "$file" == *.mov ]]; then
      echo "$file"
    fi
  done
)
if [ -n "$tracked_bad" ]; then
  echo "$tracked_bad" >&2
  fail "tracked generated artifact(s) found"
else
  note "no tracked generated artifacts"
fi

large_tracked=$(
  git ls-files | while IFS= read -r file; do
    [ -f "$file" ] || continue
    size_kb=$(du -k "$file" | awk '{print $1}')
    if [ "$size_kb" -gt 51200 ]; then
      echo "$file ${size_kb}KB"
    fi
  done
)
if [ -n "$large_tracked" ]; then
  echo "$large_tracked" >&2
  fail "tracked file(s) over 50MB found"
else
  note "no tracked file over 50MB"
fi

if [ "$failures" -gt 0 ]; then
  echo "structure gate failed: $failures issue(s)" >&2
  exit 1
fi

echo "structure gate passed"
