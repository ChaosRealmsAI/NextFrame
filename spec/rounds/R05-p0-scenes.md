# Task — R5: Port 5 P0 scenes into the engine + scene registry wiring

## Goal
Copy the 5 reference scenes from `spec/scene-library-ref/` into `runtime/web/src/scenes/`, adapt them to register via R4's engine API, and wire a one-track demo timeline that renders all 5 via `renderAt`.

## Requirements
- Copy each reference `.js` file into `runtime/web/src/scenes/` preserving names: `auroraGradient.js`, `kineticHeadline.js`, `neonGrid.js`, `barChartReveal.js`, `lowerThirdVelvet.js`
- Each file must:
  - Export a single named function matching its filename
  - Use the `(t, params, ctx)` signature (add `globalT` parameter but it can be unused — prefix with `_` to silence linters)
  - Remain **pure**: no top-level state, deterministic output given `(t, params)`
- Create `runtime/web/src/scenes/index.js` that:
  - Imports all 5 scene functions
  - Exports `export function registerAllScenes(engine)` which calls `engine.registerScene(id, fn)` for each
  - Exports `export const SCENE_MANIFEST` — array of `{id, name, category, params, duration_hint}` describing each scene (for R3 `scene.list` to consume)
- Create `runtime/web/src/demo-timeline.json` with a ~30s demo timeline exercising all 5 scenes:
  - `{version: "1", duration: 30, background: "#0b0b14", tracks: [{id: "v1", kind: "video", clips: [...]}]}`
  - Clips in order: auroraGradient (0-6s, full screen bg), kineticHeadline (2-8s, "NextFrame"), neonGrid (8-16s), barChartReveal (16-22s with sample data), lowerThirdVelvet (22-30s)
- Create `runtime/web/demo.html` (new, independent of index.html):
  - Single full-page canvas, dark background
  - Loads engine + scenes module, registers all
  - Loads demo-timeline.json via `fetch`
  - rAF loop: compute `t = (performance.now() / 1000) % timeline.duration`, call `renderAt(ctx, timeline, t)`
  - Must actually render when opened in a browser — verify by reading the final file end-to-end

## Technical Constraints
- Zero dependencies, pure ES modules
- Scenes that receive `params.text` default to sensible strings if not provided
- No `Math.random()` anywhere in scenes — use deterministic hashes (existing ref impls already do this)
- JSDoc on every exported function
- `cargo fmt --check` and `cargo clippy --workspace --all-targets -- -D warnings` still pass (no Rust changes expected, but don't break workspace)

## Code Structure
```
runtime/web/
├── demo.html                         # new — standalone scene demo
└── src/
    ├── scenes/
    │   ├── index.js                  # registry wiring + SCENE_MANIFEST
    │   ├── auroraGradient.js
    │   ├── kineticHeadline.js
    │   ├── neonGrid.js
    │   ├── barChartReveal.js
    │   └── lowerThirdVelvet.js
    └── demo-timeline.json            # sample timeline
```

## Verification Commands
```bash
test -f runtime/web/src/scenes/index.js
for s in auroraGradient kineticHeadline neonGrid barChartReveal lowerThirdVelvet; do
  test -f "runtime/web/src/scenes/${s}.js" || exit 1
done
test -f runtime/web/src/demo-timeline.json
test -f runtime/web/demo.html
grep -q 'registerAllScenes' runtime/web/src/scenes/index.js
grep -q 'SCENE_MANIFEST' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => { console.log(m.SCENE_MANIFEST.length); process.exit(m.SCENE_MANIFEST.length === 5 ? 0 : 1); })"
python3 -c "import json; d = json.load(open('runtime/web/src/demo-timeline.json')); assert d['duration'] == 30; assert len(d['tracks'][0]['clips']) == 5; print('timeline ok')"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
```

## Non-Goals
- NO UI chrome (R6 onwards)
- NO actual editing functionality
- NO replacing index.html — demo.html is separate, index.html is the R2 splash
