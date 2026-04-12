# Q-wgpu Report

## Result

- Output file: `frame_t5.png`
- Command: `cargo run --release -- 5.0`
- Machine used: Apple Silicon / `arm64` macOS `26.0`
- `wgpu` version: `29.0.1` (latest stable on crates.io at build time)
- GPU init time: `23.80 ms`
- Average GPU render pass time: `0.038 ms`
  - Measured with `TIMESTAMP_QUERY` around the render pass itself
- Average render-only wall time: `2.605 ms`
  - CPU-visible submit + wait cost, no texture readback
- Average end-to-end frame time: `3.692 ms`
  - Render + GPU/CPU copyback, before PNG encode
- Source LOC: `765` total
  - `13` in `Cargo.toml`
  - `614` in `src/main.rs`
  - `138` in `src/shader.wgsl`

## Comparison Vs E-rust-skia

`E-rust-skia` reports `50.94 ms` for its tiny-skia render pass at `1920x1080`.

- Pure GPU render pass in Q: `0.038 ms`
  - About `1340x` faster than E’s reported render-pass time
- Render-only wall time in Q: `2.605 ms`
  - About `19.6x` faster than E
- End-to-end render + readback in Q: `3.692 ms`
  - About `13.8x` faster than E

The important distinction is that the GPU timestamp number isolates shader execution, while the wall-clock numbers include CPU/GPU synchronization. In this POC, readback is the dominant cost once the shader work moves onto the GPU.

## Setup

Run from this directory:

```bash
cargo run --release -- 5.0
```

The binary defaults to `t = 5.0` if no argument is supplied and writes `frame_t5.png` next to the source.

Dependencies:

- `wgpu = "29.0.1"`
- `bytemuck = "1.24"`
- `pollster = "0.4"`
- `png = "0.17"`

## Implementation Notes

- Aurora blob centers, radii, and HSL-derived color stops are computed on the Rust side from `t` and uploaded as uniforms.
- A single fullscreen triangle runs a WGSL fragment shader that:
  - evaluates the base vertical gradient
  - screen-blends the 4 radial blobs
  - applies the dark band overlay
  - adds deterministic `3x3` grain using the same integer hash structure as the JS and Rust CPU ports
- Rendering is headless into an offscreen `Rgba8Unorm` texture.
- The texture is copied into a mapped readback buffer and then encoded to PNG on the CPU.

## Verification

- `frame_t5.png` is a valid `1920 x 1080` RGBA PNG
- The generated frame has `33760` unique colors, so it is clearly non-blank
- Comparing Q’s PNG with `E-rust-skia/frame_t5.png` gave normalized RMSE `0.00156007`, so the wgpu shader output tracks the existing Rust port closely

## Gotchas

- This POC is intentionally a standalone crate. The parent `NextFrame` workspace does not include `poc-render/*`, so `Q-wgpu/Cargo.toml` needs its own empty `[workspace]` table to make `cargo run` work from this directory.
- `wgpu` timing needs careful interpretation:
  - `TIMESTAMP_QUERY` gives the actual GPU render-pass time
  - wall-clock timings are much higher because they include command submission, waiting, and especially readback
- The `wgpu 29` API differs from older tutorials:
  - pipeline layouts take `bind_group_layouts: &[Option<&BindGroupLayout>]`
  - `RenderPassColorAttachment` includes `depth_slice`
  - texture copies use `TexelCopy*` types instead of the older `ImageCopy*` names
