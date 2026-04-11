# Task — R62: dataPulse audio-style waveform scene

## Goal
A frame-pure scene that draws a faux audio waveform with smooth pulsing animation. Looks like an EQ visualizer.

## Requirements

### Scene (`runtime/web/src/scenes/dataPulse.js`)
- Frame-pure `(t, params, ctx, globalT)`:
  - Params: `{bars, hueA, hueB, peak, baseHeight, smoothness, glowAlpha}`
  - Defaults: `bars=64, hueA=180, hueB=320, peak=0.8, baseHeight=0.15, smoothness=0.25, glowAlpha=0.4`
  - Bars centered horizontally, equal width with gap
  - Each bar height: `baseHeight + (sin(i*0.4 + t*2.5) * 0.4 + sin(i*0.13 + t*1.7) * 0.6) * peak`
  - Apply smoothness to neighbors (3-tap moving average)
  - Color: lerp hueA→hueB by i/bars
  - Glow: same bar drawn at 1.6x width with glowAlpha
  - Reflection: mirror below center line at 30% alpha

### Registration
- Add to scenes/index.js, 16 scenes total

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/scenes/dataPulse.js
grep -q 'dataPulse' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => process.exit(m.SCENE_MANIFEST.length === 16 ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
