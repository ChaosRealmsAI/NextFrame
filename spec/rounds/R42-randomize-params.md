# Task — R42: "Randomize params" button in Inspector

## Goal
Add a "🎲 Randomize" button in the Inspector's Scene section that picks random valid values for all params of the currently selected scene. Uses param schema (min/max/options) to stay valid. Undoable.

## Requirements

### Inspector addition (`runtime/web/src/panels/inspector/sections.js`)
- When a scene clip is selected and the Scene section renders, add a button `🎲 Randomize` at the top of the params list
- Click → for each param in `sceneManifest.params`:
  - `range` (number): pick random within range
  - `options` (enum): pick random option
  - `type: 'color'` (hex): generate random hex
  - `type: 'text'`: leave unchanged (don't randomize user text)
- Dispatch a `randomizeParamsCommand` through the command dispatcher (undoable)

### Command (`runtime/web/src/commands.js`)
- `randomizeParamsCommand({clipId, newParams})` — captures previous params, sets new, invert restores

### Seeded random
- Use a local LCG/xorshift with a seed derived from `Date.now()` — NOT `Math.random()` directly (keep scenes pure; this randomizer lives outside frame-pure scope, can use real Math.random)

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
grep -qE 'Randomize|randomize' runtime/web/src/panels/inspector/sections.js
grep -qE 'randomizeParamsCommand|randomizeParams' runtime/web/src/commands.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
