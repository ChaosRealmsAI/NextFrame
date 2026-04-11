# Task — R32: Morning demo polish

## Goal
Small polish pass for the first-launch experience: add a welcome overlay, improve the demo timeline's aesthetic parameters, make sure Space/B/Cmd+S hints are visible.

## Requirements

### Welcome overlay (`runtime/web/src/welcome.js`)
- `export function showWelcome(container)` — inserts a centered overlay div:
  - Shows "NextFrame v0.1" title, "AI-native video editor" subtitle
  - Shows 3 keyboard hints: "⎵ Play/Pause   B Blade tool   ⌘S Save"
  - Background: rgba(11,11,20,0.94) covering the full preview area
  - Fades out over 600ms starting at 2s after mount
  - Auto-removes itself from DOM after fade
- Call `showWelcome(document.getElementById('center-preview'))` from index.html initApp after mountPreview

### Demo timeline refinement
- `runtime/web/src/demo-timeline.json` — keep the 5 scenes but tune params for more drama:
  - auroraGradient: wider hue range for more color shift
  - kineticHeadline: set text to "NEXTFRAME" (uppercase), subtitle "Frame-pure · AI-native · Desktop"
  - neonGrid: faster scroll
  - barChartReveal: title "FEATURES", values showing real feature names (Scenes, Timeline, Export, Audio, Undo)
  - lowerThirdVelvet: title "READY TO EDIT", subtitle "Drop assets → timeline"
- Do NOT change clip start/dur — timing is locked

### Keyboard help hint in top-right corner
- `runtime/web/src/help-hint.js` — mounts a small badge in the top menu area showing "? for help"
- On click or `?` key, toggles a modal with full shortcut list
- Modal is dismissable with Esc or clicking outside

### Launch smoke test
- `scripts/smoke.sh` — runs `cargo run --release -p shell &` + `sleep 3` + `pkill shell` — verifies shell can launch without crashing
- Exit 0 if shell ran for ≥2 seconds
- This IS in scope — catches boot-time panics

## Technical Constraints
- Pure ES modules, no deps
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `node runtime/web/test/bdd/run.mjs`, `bash scripts/smoke.sh` all pass
- No regression

## Verification Commands
```bash
test -f runtime/web/src/welcome.js
test -f runtime/web/src/help-hint.js
test -f scripts/smoke.sh
grep -q 'showWelcome' runtime/web/src/welcome.js
grep -q 'showWelcome' runtime/web/index.html
grep -q 'NEXTFRAME' runtime/web/src/demo-timeline.json
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
node runtime/web/test/bdd/run.mjs
bash scripts/smoke.sh
```
