# Task — R58: shapeBurst scene

## Goal
Animated geometric shape burst — circles, triangles, squares emerging from center with radial outward motion. Frame-pure with deterministic hash.

## Requirements

### Scene (`runtime/web/src/scenes/shapeBurst.js`)
- Frame-pure `(t, params, ctx, globalT)`:
  - Params: `{count, shape, hueStart, hueEnd, sizeMin, sizeMax, speed, gravity, fadeOut}`
  - Defaults: `count=80, shape='mixed', hueStart=200, hueEnd=320, sizeMin=12, sizeMax=48, speed=320, gravity=120, fadeOut=true`
  - shape: 'circle' | 'triangle' | 'square' | 'mixed'
  - For each particle index 0..count:
    - Birth time `birth = hash(i, 'b') * 0.6`
    - Angle `angle = i / count * TAU + hash(i, 'a') * 0.3`
    - Local time = max(0, t - birth)
    - Position: radius = speed * localTime, gravity drops Y over time
    - Size: lerp(sizeMin, sizeMax, hash(i, 's'))
    - Hue: lerp(hueStart, hueEnd, i/count)
    - Alpha: 1 - (localTime / lifespan) if fadeOut
    - Skip if alpha <= 0

### Registration
- Add to scenes/index.js with full SCENE_MANIFEST entry
- 13 scenes total

## Technical Constraints
- Pure ES modules
- No new deps
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/scenes/shapeBurst.js
grep -q 'shapeBurst' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => process.exit(m.SCENE_MANIFEST.length === 13 ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
