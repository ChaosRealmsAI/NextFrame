# Task — R33: Expand scene library to 10 scenes

## Goal
Add 5 more frame-pure scenes to `runtime/web/src/scenes/` to make the library feel rich. Must match existing quality (aesthetic, deterministic, pure). Register all of them so they appear in the left library panel.

## Requirements

### New scenes (5 total)
All in `runtime/web/src/scenes/*.js`, exported as named functions matching the filename. Pure function signature `(t, params, ctx, globalT)`.

1. **`starfield.js`** — Backgrounds. Procedural 3D parallax starfield: 3 depth layers of stars scrolling at different speeds, tiny radial gradients with hue shift. Deterministic hash for star positions.
2. **`circleRipple.js`** — Shapes & Layout. Concentric rings emanating from center, each ring a different hue, expanding + fading. Must be pure: each ring's current radius = smoothstep(t, born, born+lifespan) * maxR.
3. **`countdown.js`** — Typography. Giant numeric countdown "5 4 3 2 1 GO". Each number enters with scale+blur, exits shrinking. Stagger via t mod 1.
4. **`lineChart.js`** — Data Viz. A rising line chart with 8 data points, line drawn progressively via smoothstep, dots popping in on completion, y-axis grid. HSL gradient on line.
5. **`cornerBadge.js`** — Overlays. A corner badge (like a TV news ticker) that slides in from top-right, shows "BREAKING" + a subtitle, has a pulsing indicator dot.

### Registration
- Update `runtime/web/src/scenes/index.js`:
  - Import all 5 new scene functions
  - Add to `SCENE_REGISTRY` array with full metadata
  - Add to `SCENE_MANIFEST` with params schemas
- Category colors from existing CATEGORY_COLORS map (blue/cyan/purple/green/pink)

### Quality bar
- Every scene must render something visually distinct at any t (frame-pure)
- Use local `smoothstep`/`easeOutCubic` — no imports from `../engine/easing.js` (keep scenes self-contained like existing ones)
- No `Math.random()` — use deterministic hash `hash(i, salt)`
- Default params sensible (scene has to look good with empty `{}` params)
- Aesthetic: dark background assumed, vibrant HSL colors, subtle glow/grain OK

## Technical Constraints
- Pure ES modules
- No Rust changes
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace`, `node runtime/web/test/bdd/run.mjs` all pass
- Existing 5 scenes unchanged

## Verification Commands
```bash
for s in starfield circleRipple countdown lineChart cornerBadge; do
  test -f "runtime/web/src/scenes/${s}.js" || { echo "missing $s"; exit 1; }
done
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => { console.log(m.SCENE_MANIFEST.length); process.exit(m.SCENE_MANIFEST.length === 10 ? 0 : 1); })"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
