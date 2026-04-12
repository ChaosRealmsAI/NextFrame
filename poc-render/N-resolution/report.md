# POC N: Cross-Resolution Rendering

## What was built

Headless Node renderer using `@napi-rs/canvas`, importing the shared scene from `../auroraGradient.js` and rendering the same aurora state at `t=5.0` into five target resolutions:

- `frame_4k.png` — 3840x2160
- `frame_1080.png` — 1920x1080
- `frame_vertical.png` — 1080x1920
- `frame_square.png` — 1080x1080
- `frame_small.png` — 720x720

CLI:

```bash
npm install
node index.js
```

Optional explicit time:

```bash
node index.js 5.0
```

## Render times

Measured on a single run of `node index.js`:

| Output | Resolution | Render time |
| --- | --- | ---: |
| `frame_4k.png` | 3840x2160 | 1325.448 ms |
| `frame_1080.png` | 1920x1080 | 384.056 ms |
| `frame_vertical.png` | 1080x1920 | 373.733 ms |
| `frame_square.png` | 1080x1080 | 242.266 ms |
| `frame_small.png` | 720x720 | 125.666 ms |

## PNG dimension verification

Verified two ways:

- In-process by decoding each generated PNG buffer with `loadImage`
- Externally with `sips -g pixelWidth -g pixelHeight ...`

All outputs matched exactly:

| File | Verified dimensions |
| --- | --- |
| `frame_4k.png` | 3840x2160 |
| `frame_1080.png` | 1920x1080 |
| `frame_vertical.png` | 1080x1920 |
| `frame_square.png` | 1080x1080 |
| `frame_small.png` | 720x720 |

## Responsiveness and artifacts

The scene adapts cleanly without distortion across all five canvases:

- The background gradient always fills the full canvas.
- Blob positions scale with `width` and `height`, so composition reframes naturally per aspect ratio instead of stretching.
- Blob radii use `Math.min(width, height)`, which keeps them proportionate and circular across landscape, portrait, and square outputs.

Visual observations:

- Landscape outputs preserve the widest spread of blobs.
- The portrait output keeps the same scene state at `t=5`, but the narrower width makes the composition feel more vertically stacked rather than distorted.
- Square outputs remain balanced and readable.
- The small square output is still visually valid, but the film grain is slightly chunkier relative to frame size.

Artifacts / caveats:

- No obvious stretching, clipping, or blank regions were observed.
- The grain pass uses a fixed `3px` step, so perceived grain density changes with resolution: finer at 4K, coarser at 720x720.
- Because blob centers are computed from normalized width/height positions, very unusual aspect ratios would reframe the scene rather than preserve identical crop coverage. That is graceful adaptation, not pixel-for-pixel invariance.

## Does the frame-pure function adapt gracefully to any resolution?

Yes, for practical raster sizes it adapts gracefully. The scene function does not hardcode `1920x1080`; it resolves canvas dimensions from the drawing context and scales its fills, gradients, and blob radii from those dimensions. The main limitation is that some details are pixel-based rather than normalized, especially the grain block size, so texture character shifts slightly as resolution changes.

## LOC

Solution LOC excluding generated files and dependencies:

- `index.js`: 81
- `package.json`: 12
- Total: 93

## Setup steps

- `npm install`
- `node index.js`

## Honest gotchas

- `../auroraGradient.js` is an ES module export, so this POC must run with `"type": "module"`.
- Verifying actual PNG dimensions is worth doing explicitly; trusting canvas dimensions alone would not prove the encoded files are correct.
