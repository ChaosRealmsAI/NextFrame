# Task — R38: Interactive tutorial tooltips

## Goal
Guide first-time users through the editor with step-by-step tooltips that highlight key UI areas. Dismissable and resumable.

## Requirements

### Tutorial module (`runtime/web/src/tutorial/`)
- `tutorial/index.js` — `export function startTutorial({store, anchors})` — where `anchors` is a map of step name → DOM element
- Steps (in order):
  1. Welcome → preview area: "Here's your playback preview. Scenes render frame-pure."
  2. Library → `#left-library`: "Drag any scene onto a track to create a clip."
  3. Timeline → `#bottom-timeline`: "Your project timeline. Drag clips, resize edges, use Blade (B) to split."
  4. Inspector → `#right-inspector`: "Select a clip to edit its parameters live."
  5. Export → File menu: "When ready, File → Export to render MP4."
- Each step: highlights the anchor with a pulsing outline + shows a tooltip bubble nearby
- Arrow keys: Left/Right = prev/next. Esc = dismiss.
- "Next" button in tooltip advances; "Got it" button on last step exits
- State persisted to `store.state.tutorialComplete` (skip on subsequent launches)
- Integrated into index.html initApp after mounts — only runs if not completed yet

### Tutorial style
- Tooltip: rounded 8px, dark bg (#14141e), white text, 12px padding, 6-8 word body + 14px bold title
- Arrow pointing at anchor
- Backdrop: subtle dim on non-highlighted areas (rgba(0,0,0,0.35))

## Technical Constraints
- Pure ES modules
- No new Rust
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace`, `node runtime/web/test/bdd/run.mjs` pass
- No regression

## Verification Commands
```bash
test -f runtime/web/src/tutorial/index.js
grep -q 'startTutorial' runtime/web/src/tutorial/index.js
grep -q 'startTutorial' runtime/web/index.html
grep -q 'tutorialComplete' runtime/web/src/store.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
