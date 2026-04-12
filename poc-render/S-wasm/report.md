# S-wasm Report

## Result

- Output file: `frame_t5.png`
- Build + run command:

```bash
cd poc-render/S-wasm
wasm-pack build --target nodejs && cd .. && node index.js
```

- The Node launcher calls:

```js
render_aurora(1920, 1080, 5.0, 270, 200, 320, 1.0, 0.04)
```

- Measured render latency for the WASM export only, excluding PNG encoding:
  - First call: `107.46 ms`
  - Subsequent call average: `49.29 ms` across 5 warm calls
- Compiled WASM binary size: `28,225 bytes` (`pkg/s_wasm_bg.wasm`)
- Total generated `pkg/` size: `31,049 bytes`
- Source LOC: `423` total
  - `21` in `Cargo.toml`
  - `342` in `src/lib.rs`
  - `52` in `../index.js`
  - `8` in `../package.json`

## Verification

- `frame_t5.png` exists and is a valid `1920 x 1080` RGBA PNG
- Quick image stats on the generated file showed `40219` unique RGB colors, so the output is non-blank and non-flat

## Comparison Vs E-rust-skia Native

- `E-rust-skia` reported `50.94 ms` native render time at the same `1920x1080` size and `t=5.0`
- This WASM version averaged `49.29 ms` once warm, which is effectively the same class of performance in this test and slightly faster by about `1.65 ms` (`~3.2%`)
- The first WASM call was much slower at `107.46 ms`, about `2.11x` the native timing, which reflects one-time runtime and allocation costs

The practical read is that warm steady-state performance is competitive with the native Rust port for this pure CPU pixel kernel, but first-hit latency is noticeably worse.

## Viability

WASM looks viable here as a runtime for scene scripting when the scene can be expressed as a pure function over buffers and the host already lives in JS/Node. The exported function boundary is simple, the binary is small, and warm render speed is on par with the native Rust reference.

It is not a universal win. The scene still had to be ported away from Canvas APIs into explicit pixel math, PNG writing still happens on the host side, and cold-start latency is materially worse than native. For reusable scene kernels in a JS render pipeline, WASM is credible. For lowest-latency single-shot renders or APIs that want direct native graphics integration, the native Rust path is still cleaner.

## Setup

- One-time Node dependency install from `poc-render/`:

```bash
npm install
```

- Rust/WASM build dependency:

```bash
cargo install wasm-pack
```

`wasm-pack 0.14.0` was used for this run.

## Gotchas

- The original `auroraGradient.js` uses Canvas gradients and blend modes. This POC is a math port, not a browser Canvas embedding.
- `wasm-pack`'s `wasm-opt` post-pass failed against the generated module on this machine because the downloaded optimizer rejected bulk-memory/trunc-sat features, so `wasm-opt` was disabled in `Cargo.toml`.
- The requested launcher flow is split across two locations: the Rust crate lives in `S-wasm/`, while `poc-render/index.js` imports `./S-wasm/pkg/s_wasm.js` and writes the PNG back into `S-wasm/frame_t5.png`.
