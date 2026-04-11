# Task — R53: imageHero scene with Ken Burns animation

## Goal
A frame-pure scene that displays an image with a slow Ken Burns zoom-pan effect. Image source via params (data URL or local file URL).

## Requirements

### Scene (`runtime/web/src/scenes/imageHero.js`)
- Frame-pure function `(t, params, ctx, globalT)`:
  - Params: `{ src, fit, zoomStart, zoomEnd, panX, panY, holdEdges }`
  - Defaults: `src=null, fit='cover', zoomStart=1, zoomEnd=1.15, panX=0.05, panY=-0.03, holdEdges=true`
  - Lazy-loads image: keeps an `Image` cache by src URL outside the function (safe — caching is not "state" because it's deterministic for a given src)
  - If image not loaded yet, draws a dark gradient placeholder
  - Once loaded, draws scaled+positioned to canvas:
    - Compute scale by fit ('cover' = canvas filled, may crop)
    - Apply zoom: `zoom = zoomStart + (zoomEnd-zoomStart) * t/duration`
    - Apply pan: offset by `panX*t, panY*t` of canvas dimensions
- Falls back gracefully if image fails to load

### Image cache (`runtime/web/src/scenes/_image-cache.js`)
- `loadImage(src)` returns `HTMLImageElement` with cache map
- Resolved images are cached forever during session

### Registration
- Add to scenes/index.js — bring SCENE_MANIFEST to 12

## Technical Constraints
- Pure ES modules
- Frame-pure preserved (image cache is OK because deterministic)
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/scenes/imageHero.js
test -f runtime/web/src/scenes/_image-cache.js
grep -q 'imageHero' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => process.exit(m.SCENE_MANIFEST.length === 12 ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
