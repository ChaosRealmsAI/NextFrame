# T-video-seek Report

## Input

- Source video: `/Users/Zhuanz/bigbang/NextFrame/poc-render/H-frames-to-mp4/out.mp4`
- Source resolution: `1920x1080`
- Source duration: `5.000 s`
- Source fps: `30.000`
- Scene model: `videoClipScene(t, params:{src, srcStart, srcEnd, speed, fit}, ctx)`

## Per-Frame Results

### frame_normal.png

- Params: `t=2.0`, `srcStart=0.0`, `srcEnd=5.0`, `speed=1.0`, `fit=cover`
- Expected source time: `2.000 s`
- Resolved raw source time: `2.000 s`
- Extracted source time: `2.000 s`
- Initial extract latency: `69.354 ms`
- Initial render time: `207.515 ms`
- Repeat render time: `135.258 ms`
- Repeat render hit cache: `true`
- Pixel hash stable across repeated render: `true`

### frame_2x.png

- Params: `t=2.0`, `srcStart=0.0`, `srcEnd=5.0`, `speed=2.0`, `fit=cover`
- Expected source time: `4.000 s`
- Resolved raw source time: `4.000 s`
- Extracted source time: `4.000 s`
- Initial extract latency: `65.614 ms`
- Initial render time: `201.562 ms`
- Repeat render time: `134.295 ms`
- Repeat render hit cache: `true`
- Pixel hash stable across repeated render: `true`

### frame_half.png

- Params: `t=2.0`, `srcStart=0.0`, `srcEnd=5.0`, `speed=0.5`, `fit=cover`
- Expected source time: `1.000 s`
- Resolved raw source time: `1.000 s`
- Extracted source time: `1.000 s`
- Initial extract latency: `53.077 ms`
- Initial render time: `221.497 ms`
- Repeat render time: `167.078 ms`
- Repeat render hit cache: `true`
- Pixel hash stable across repeated render: `true`

### frame_reverse.png

- Params: `t=2.0`, `srcStart=5.0`, `srcEnd=0.0`, `speed=-1.0`, `fit=cover`
- Expected source time: `3.000 s`
- Resolved raw source time: `3.000 s`
- Extracted source time: `3.000 s`
- Initial extract latency: `60.434 ms`
- Initial render time: `195.784 ms`
- Repeat render time: `133.592 ms`
- Repeat render hit cache: `true`
- Pixel hash stable across repeated render: `true`

## Performance

- Total script wall time: `1457.926 ms`
- Uncached extract latencies: `69.354 ms, 65.614 ms, 53.077 ms, 60.434 ms`
- Average uncached extract latency: `62.120 ms`
- Cache requests / hits / misses: `8 / 4 / 4`
- Cache hit rate: `50.0%`

## Frame-Pure Verdict

- Preserved: `true`
- Evidence: every repeated render of the same `(t, params)` produced the same pixel hash, and each repeat hit the `(src,time)` frame cache instead of launching ffmpeg again.

## Negative Speed Gotchas

- Reverse playback needs `srcEnd` treated as the lower bound. If negative-speed clips defaulted `srcEnd` to video duration, they would freeze immediately because `srcTime < srcEnd` on the first step.
- `srcStart=5.0` is conceptually valid for this source, but ffmpeg frame extraction still clamps terminal seeks slightly below duration to avoid empty output on exact end timestamps.
- The freeze rule becomes directional: forward clips freeze when `srcTime > srcEnd`, reverse clips freeze when `srcTime < srcEnd`.
