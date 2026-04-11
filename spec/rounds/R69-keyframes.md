# Task — R69: Clip param keyframes

## Goal
Let user set keyframes on numeric clip params in the Inspector. Engine interpolates linearly between keyframes during playback.

## Requirements

### Clip data shape
- Clip param can be either a literal value OR an object `{type:'keyframes', keyframes:[{time:0, value:0.3, ease:'linear'}, ...]}`
- Backwards-compatible: literal values still work

### Engine
- `runtime/web/src/engine/keyframes.js` — `export function evalParam(param, localT)` returns the interpolated value if param is a keyframes object, else returns param as-is
- Linear interpolation only (`ease: 'linear'` is the default; reserve other modes for later)
- Out-of-range: clamp to nearest endpoint
- Engine's renderAt should use evalParam when iterating params? No — too invasive. Instead, scenes can call evalParam themselves IF they need keyframe support.
- For now: just expose evalParam helper + add to engine/index.js exports. Scenes opt-in.

### Inspector
- `runtime/web/src/panels/inspector/keyframes.js` — `export function renderKeyframeEditor({ paramName, currentValue, store, dispatch })`
- Shows a small inline timeline strip with diamond markers for each keyframe
- Click "+" button to add keyframe at current playhead time with current value
- Click marker to delete (with confirm or just toggle)
- Drag marker horizontally to move time

### Field renderer integration
- `runtime/web/src/panels/inspector/field.js` — when rendering a numeric field, show a tiny "♦" toggle button next to it that opens the keyframe editor

## Technical Constraints
- Pure ES modules
- Backwards-compatible with literal params
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/engine/keyframes.js
grep -q 'evalParam' runtime/web/src/engine/keyframes.js
grep -q 'evalParam' runtime/web/src/engine/index.js
test -f runtime/web/src/panels/inspector/keyframes.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
