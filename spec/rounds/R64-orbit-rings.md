# Task — R64: orbitRings frame-pure scene

## Goal
Concentric orbital rings with planets/dots traveling around at different speeds. Solar system aesthetic.

## Requirements

### Scene (`runtime/web/src/scenes/orbitRings.js`)
- Frame-pure `(t, params, ctx, globalT)`:
  - Params: `{ringCount, hueA, hueB, baseSpeed, dotSize, ringWidth, glow}`
  - Defaults: `ringCount=6, hueA=180, hueB=320, baseSpeed=0.4, dotSize=10, ringWidth=1.5, glow=true`
  - Center at (W/2, H/2)
  - For each ring i=0..ringCount:
    - Radius = (i+1) * min(W,H) / (ringCount * 2.4)
    - Draw ring outline at ringWidth, hue lerp by i/ringCount, alpha 0.4
    - Speed = baseSpeed * (1 - i*0.1)  // outer rings slower
    - Angle = t * speed * (i % 2 === 0 ? 1 : -1)  // alternate direction
    - For each ring, draw `i+2` planet dots evenly spaced + offset by angle
    - Dot color matches ring hue, full alpha
    - If glow, draw second pass at 2x size at 0.3 alpha

### Registration
- Add to scenes/index.js, 18 scenes total

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/scenes/orbitRings.js
grep -q 'orbitRings' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => process.exit(m.SCENE_MANIFEST.length === 18 ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
