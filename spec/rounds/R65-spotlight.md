# Task — R65: spotlightSweep frame-pure scene

## Goal
A theatrical spotlight effect that sweeps across the canvas with soft falloff. Like a search beam in the dark.

## Requirements

### Scene (`runtime/web/src/scenes/spotlightSweep.js`)
- Frame-pure `(t, params, ctx, globalT)`:
  - Params: `{beamCount, hueA, hueB, sweepSpeed, beamWidth, intensity, ambient}`
  - Defaults: `beamCount=3, hueA=210, hueB=320, sweepSpeed=0.5, beamWidth=0.4, intensity=0.85, ambient=0.05`
  - Background: solid dark with `ambient` HSL value at top
  - For each beam i:
    - Origin: top-edge X = lerp(0.1*W, 0.9*W, i/(beamCount-1) || 0.5)
    - Angle: sweep with sin(t * sweepSpeed + i * 1.3) * 0.6 (radians from straight down)
    - Length: H + 100
    - Draw a triangular wedge from origin to two ground points (origin.x + sin(angle)*length ± width/2)
    - Use radial gradient from origin (full alpha) to far end (0 alpha)
    - Hue lerp by i / beamCount
    - Composite: 'lighter' for additive
  - Restore composite after

### Registration
- Add to scenes/index.js, 19 scenes total

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/scenes/spotlightSweep.js
grep -q 'spotlightSweep' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => process.exit(m.SCENE_MANIFEST.length === 19 ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
