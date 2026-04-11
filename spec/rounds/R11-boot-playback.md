# Task — R11: Bootstrap scene registry + demo-timeline autoplay in preview

## Goal
When `cargo run -p shell` opens the window, the preview canvas automatically renders the R5 demo-timeline playing the 5 scenes on a continuous loop — not a blank canvas. This makes the editor visually alive on first launch. Also formalize store mutations with a tiny command dispatcher for R18 undo.

## Requirements

### Scene bootstrap
- Modify `runtime/web/index.html`'s module script so that, after imports, it:
  1. Calls `registerAllScenes(engine)` from `./src/scenes/index.js` — registers all 5 scenes in the engine's SCENES map
  2. Fetches `./src/demo-timeline.json`, parses, validates via `engine.validateTimeline`, puts into `store.state.timeline` via `store.mutate`
  3. Sets `store.state.playing = true` so the rAF loop runs continuously
- `preview/loop.js` (or `preview/index.js`) tick function: when `store.state.playing`, increment `store.state.playhead` by `dt` each rAF, wrap at `timeline.duration`
- On every tick, call `engine.renderAt(ctx, timeline, playhead)` — this actually draws the scene onto the canvas

### Store commands + history stub
- `runtime/web/src/commands.js` (new): `export function createDispatcher(store)` returning `{dispatch(cmd), undo(), redo(), canUndo, canRedo}`
- Command shape: `{type, exec(state)→newState, invert(state, prevState)→invertCmd}`
- `dispatch` runs exec, pushes inverse to undo stack, clears redo stack
- Minimal commands: `addClip`, `removeClip`, `moveClip`, `setClipParam`, `selectClip`, `setPlayhead` (setPlayhead not undoable — skip history push)
- Expose `store.dispatch` as a convenience that routes to the global dispatcher

### Keyboard
- Space bar toggles `store.state.playing`
- Left/Right arrow jogs playhead ±1s when paused
- Shift+Left/Right jogs ±5s

## Technical Constraints
- Pure ES modules
- No new Rust crates / deps
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace` all pass
- R7's save/load still works (commands may bypass history for save/load, that's fine)

## Code Structure
```
runtime/web/src/
├── commands.js           (new)
└── preview/loop.js       (minor update: integrate with store.playing)
Also:
├── index.html            (module script: registerAllScenes + load demo-timeline + kb handlers)
└── store.js              (add dispatch field, playing default true)
```

## Verification Commands
```bash
test -f runtime/web/src/commands.js
grep -q 'createDispatcher' runtime/web/src/commands.js
grep -q 'undo' runtime/web/src/commands.js
grep -q 'redo' runtime/web/src/commands.js
grep -q 'registerAllScenes' runtime/web/index.html
grep -q 'demo-timeline.json' runtime/web/index.html
grep -q 'playing' runtime/web/src/store.js
grep -qE 'Space|" "' runtime/web/index.html
node --input-type=module -e "import('./runtime/web/src/commands.js').then(m => process.exit(typeof m.createDispatcher === 'function' ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
```

## Non-Goals
- NO full drag-drop (R13)
- NO clip resize (R14)
- NO audio (R22)
- NO file menu regression — R7 menu.js should still work
