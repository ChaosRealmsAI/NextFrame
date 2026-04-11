# Task — R23: Scrub optimization + smooth playhead

## Goal
Make timeline scrub smoother: when user drags the playhead on the ruler, preview renders throttled at ~30fps instead of every frame (avoids render thrash on heavy scenes). Also debounce store mutations so subscribers aren't spammed during drag.

## Requirements

### Scrub throttle (`runtime/web/src/timeline/scrub.js`)
- `export function startScrubbing(store, { onEnd })` — enters scrub mode, sets `store.state.scrubbing = true`
- `export function endScrubbing(store)` — exits, dispatches pending final playhead mutation once
- While scrubbing: mutations to `playhead` are throttled to 1/33ms (~30fps)

### Ruler drag integration
- `runtime/web/src/timeline/ruler.js` — ruler mousedown on the ruler strip starts scrubbing, mousemove updates playhead (throttled), mouseup ends scrubbing
- Clicking on ruler (no drag) sets playhead immediately and does NOT enter scrub mode

### Preview loop guard
- `runtime/web/src/preview/index.js` — when `store.state.scrubbing === true`, pause the rAF loop; render only on playhead change (responsive to user input); resume rAF loop on scrub end

### Store
- Add `state.scrubbing: false`

## Technical Constraints
- Pure ES modules
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace`, `node runtime/web/test/bdd/run.mjs` all pass
- No regression

## Verification Commands
```bash
test -f runtime/web/src/timeline/scrub.js
grep -q 'startScrubbing\|endScrubbing' runtime/web/src/timeline/scrub.js
grep -q 'scrubbing' runtime/web/src/store.js
grep -q 'scrubbing' runtime/web/src/preview/index.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
