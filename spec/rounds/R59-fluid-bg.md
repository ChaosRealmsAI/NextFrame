# Task — R59: fluidBackground frame-pure scene

## Goal
Animated fluid background — flowing color blobs with metaball-like aesthetic. 4-5 large color circles drifting with sine-based positioning, blending modes for soft glow.

## Requirements

### Scene (`runtime/web/src/scenes/fluidBackground.js`)
- Frame-pure `(t, params, ctx, globalT)`:
  - Params: `{ blobCount, hueA, hueB, hueC, intensity, drift, blur }`
  - Defaults: `blobCount=5, hueA=210, hueB=290, hueC=340, intensity=0.6, drift=0.4, blur=80`
  - For each blob index 0..count:
    - Center: `(W*0.5 + sin(t*0.3 + i)*drift*W*0.4, H*0.5 + cos(t*0.4 + i*1.7)*drift*H*0.4)`
    - Radius: `min(W,H) * 0.35 + sin(t + i*0.7) * 50`
    - Color: HSL between hueA/hueB/hueC, alpha = intensity * 0.6
  - Use `ctx.filter = 'blur(${blur}px)'` for soft edges, restore after
  - `globalCompositeOperation = 'screen'` for additive look
  - Restore composite + filter after drawing

### Registration
- Add to scenes/index.js, 14 scenes total

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/scenes/fluidBackground.js
grep -q 'fluidBackground' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => process.exit(m.SCENE_MANIFEST.length === 14 ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
