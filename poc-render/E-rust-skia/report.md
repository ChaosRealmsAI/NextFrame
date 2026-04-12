# E-rust-skia Report

## Result

- Output file: `frame_t5.png`
- Command: `cargo run --release -- 5.0`
- Measured render time: `50.94 ms` for the render pass at `1920x1080`
- Source LOC: `397` total (`9` in `Cargo.toml`, `388` in `src/main.rs`)

## Setup

- Dependencies: `tiny-skia = "0.11"`, `png = "0.17"`
- Run from this directory:

```bash
cargo run --release -- 5.0
```

The binary defaults to `t = 5.0` if no CLI argument is supplied and writes `frame_t5.png` next to the source.

## Faithfulness To The JS Original

This is a direct math port of `auroraGradient.js` rather than a JS embedding:

- Same base 3-stop vertical gradient colors
- Same 4 blob definitions, phase/speed/amplitude values, and breathing radius formula
- Same HSL stop values for each radial blob
- Same fade-in curve via `smoothstep(0, 0.6, t)`
- Same deterministic grain seed and 32-bit hash structure, with `3x3` blocks and overlay compositing

Expected minor differences from Canvas:

- The Rust version evaluates gradients and blend modes explicitly per pixel instead of relying on browser Canvas internals.
- Color interpolation is done in straightforward RGBA math, so tiny differences versus browser premultiplied-gradient behavior are possible at blob edges.

Visually it is faithful to the original scene intent: dark base, purple/blue/pink drifting screen-blended aurora blobs, and subtle deterministic film grain.

## Verification

- `frame_t5.png` exists and is a valid `1920 x 1080` RGBA PNG
- Quick image stats on the generated file showed `40219` unique colors, so the render is clearly non-blank and non-flat

## Gotchas

- `tiny-skia` is used here as the framebuffer container; the Canvas blend/composite behavior is ported manually to avoid depending on unsupported browser APIs.
- Release mode matters. Debug builds work, but the measured timing above is from `--release`.
