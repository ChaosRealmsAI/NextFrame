# K-parallel-render Report

## Result

- Output file: `frame_t5.png`
- Single-frame render call: `auroraGradient(5.0, { hueA: 270, hueB: 200, hueC: 320, intensity: 1, grain: 0.04 }, ctx)`
- Benchmark frames: `/tmp/poc-k/frame_0000.png` through `/tmp/poc-k/frame_0299.png`
- Worker model: Node `worker_threads`

## Timing

- Single-frame render + PNG encode at `t=5.0`: `401.099 ms`
- Sequential 300-frame wall time: `130259.328 ms`
- Parallel 300-frame wall time with 8 workers: `34630.633 ms`
- Speedup ratio: `3.761x`
- Theoretical max speedup with 8 workers: `8x`

## LOC

- Total LOC in this POC dir: `326`

## Setup

```bash
npm install
node index.js
node index.js 5.0
```

## Gotchas

- The prompt says "300 frames" and also "t = 0..10s @ 30fps". Those two statements conflict if interpreted inclusively, so this POC uses 300 frames at `t = frame / 30`, which covers `0.0` through `9.9667` seconds.
- Speedup will not approach 8x in practice because each frame still pays PNG encoding and filesystem write costs, and each worker repeats native canvas setup.
- Running sequential first warms the OS file cache and native module state a bit, so these numbers are useful as a pragmatic comparison, not a perfectly isolated benchmark.
- `worker_threads` keeps the implementation simple because each worker can import the shared scene module directly and render frame-pure timestamps without any cross-worker state.
