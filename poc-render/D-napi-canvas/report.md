# D-napi-canvas Report

## Result

- Output file: `frame_t5.png`
- Verified format: PNG, 1920x1080 RGBA
- Render target call: `auroraGradient(5.0, { hueA: 270, hueB: 200, hueC: 320, intensity: 1, grain: 0.04 }, ctx)`

## Timing

- Cold run render + PNG encode: `381.449 ms`
- Warm run 1 render + PNG encode: `375.987 ms`
- Warm run 2 render + PNG encode: `377.827 ms`
- Warm average: `376.907 ms`

## Timing Comparison Vs Expected

`@napi-rs/canvas` is native and fast to set up, but this specific scene is not "low tens of milliseconds" fast in this environment. The measured render settled around `377 ms`, which is slower than the optimistic expectation for a skia-backed canvas when drawing a single 1080p frame.

The likely reason is the scene itself: the grain pass draws `3x3` rectangles across the full frame, which means roughly `230k` JS-driven `fillRect` calls per render. That pushes a lot of work through the 2D API, so the bottleneck is the scene's draw pattern more than canvas initialization.

## LOC

- Total LOC in the POC dir: `158`
- Wrapper LOC (`index.js` + `package.json`): `56`
- Shared scene LOC (`auroraGradient.js`): `102`

## Setup

```bash
npm install
node index.js 5.0
```

## Gotchas

- `auroraGradient.js` uses ESM syntax, so the POC package is marked `"type": "module"` and the file is kept inside this directory for a clean dynamic import.
- The script always writes `frame_t5.png`, matching the shared spec and requested output name.
- Timing includes both scene rendering and `canvas.toBuffer('image/png')`.
