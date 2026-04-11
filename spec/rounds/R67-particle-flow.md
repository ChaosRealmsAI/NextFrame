# Task — R67: particleFlow vector field scene

## Goal
Particles flowing through a noise-driven vector field. Trails leave subtle ribbons. Frame-pure with deterministic seeding.

## Requirements

### Scene (`runtime/web/src/scenes/particleFlow.js`)
- Frame-pure `(t, params, ctx, globalT)`:
  - Params: `{count, hueA, hueB, fieldScale, speed, trailLength, lineWidth}`
  - Defaults: `count=400, hueA=180, hueB=320, fieldScale=0.004, speed=80, trailLength=24, lineWidth=1.2`
  - For each particle index 0..count:
    - Seed by hash(i)
    - Position computed via summed sine field: `x(t) = startX + sum_{k=0..trailLength}(integrate vector field)` — but to keep frame-pure, use closed-form: `x = startX + sin(startY*fieldScale + t*0.5 + i*0.13) * speed * t`
    - Use a simpler approximation: parametric path so particle position depends only on (i, t), not on previous frames
    - Color hue lerp by i/count
    - Trail: draw last N positions backwards (recompute each)
  - Wrap around canvas edges

### Registration
- Add to scenes/index.js, 21 scenes total

## Technical Constraints
- Pure ES modules
- Frame-pure preserved (no mutable particle state)
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/scenes/particleFlow.js
grep -q 'particleFlow' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => process.exit(m.SCENE_MANIFEST.length === 21 ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
