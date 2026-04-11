# Task — R35: Live scene thumbnails in library panel

## Goal
Replace the left-library scene cards' CSS gradient placeholders with live canvas thumbnails that actually render each scene at its "hero" moment (e.g., t=0.5 * duration_hint). Thumbnails auto-generate on mount.

## Requirements

### Library card update (`runtime/web/src/panels/library/card.js`)
- When creating a scene card, inject a small `<canvas>` element (96x54, 16:9)
- Use engine.renderAt to draw the scene at `sceneManifest.duration_hint * 0.5` once at mount
- If rendering fails (missing scene), fall back to existing CSS gradient placeholder
- Canvas is rendered at DPR for sharpness
- Lazy init: only render when card is visible (IntersectionObserver) OR render all at mount time (simpler)
- Result: user sees 10 actual mini previews of each scene in the library

### Implementation path
- Thumbnail size: 96x54 CSS px, canvas backing 192x108 for @2x
- Fallback: if scene not in SCENES registry (e.g., custom), show gradient
- Use same category color for card border as before

### Performance
- Thumbnails render once on mount, not continuously
- Re-render only if zoom/scene changes (unlikely in R35 scope)

## Technical Constraints
- Pure ES modules
- No Rust changes
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace`, `node runtime/web/test/bdd/run.mjs` pass
- Registered scenes from SCENE_MANIFEST are all renderable

## Verification Commands
```bash
grep -q 'canvas\|Canvas\|getContext' runtime/web/src/panels/library/card.js
grep -qE 'renderAt|engine' runtime/web/src/panels/library/card.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
