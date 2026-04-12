# O-audio-clock Report

- Command run: `npm install && node index.js`
- Shared-spec still render: `frame_t5.png` at `t=5.0`
- Total pipeline time: `58698.99 ms`
- Still render time: `386.10 ms`
- WAV generation time: `5.50 ms`
- Frame sequence render time: `56594.34 ms`
- MP4 mux time: `1616.48 ms`
- Total LOC: `516`

## Setup

- Install deps with `npm install`
- Run the full demo with `node index.js`
- Render a shared-spec still frame with `node index.js 5.0`
- Bonus mux requires `ffmpeg` and `ffprobe` on PATH

## Audio Master Clock

The renderer treats audio as the source of truth. For frame `n`, it first computes the exact audio sample position `n * sampleRate / fps`, then picks the driving sample index and derives time from `sampleIndex / sampleRate`. That keeps video tied to the discrete PCM timeline instead of letting video time drift independently.

For this exact demo, the rates align perfectly: `44100 / 30 = 1470`, so every video frame lands on an integer sample boundary and the maximum frame-time quantization error is `0.000000 ms`.

When frame boundaries do not land on exact samples, keep the exact rational sample position, then quantize once per frame using a stable policy such as nearest-sample rounding or a Bresenham-style accumulator. The important part is that the quantization happens from the audio timeline outward. Do not advance audio by `1 / fps` and hope it matches samples later.

## Mapping Preview

- frame 0: exact sample 0, chosen sample 0, t=0s
- frame 1: exact sample 1470, chosen sample 1470, t=0.033333s
- frame 2: exact sample 2940, chosen sample 2940, t=0.066667s
- frame 3: exact sample 4410, chosen sample 4410, t=0.1s
- frame 4: exact sample 5880, chosen sample 5880, t=0.133333s
- frame 147: exact sample 216090, chosen sample 216090, t=4.9s
- frame 148: exact sample 217560, chosen sample 217560, t=4.933333s
- frame 149: exact sample 219030, chosen sample 219030, t=4.966667s

## A/V Sync

Yes. ffprobe reports video at 5.000000 s and audio at 5.000000 s, so the muxed MP4 is timeline-aligned. Any residual skew comes from AAC encoder delay metadata rather than the clocking math.

- MP4 format duration: `5.000 s`
- Video stream: `h264`, `1920x1080`, `30/1`
- Audio stream: `aac`, `44100 Hz`, `1 channel(s)`
- Audio/video duration delta: `0.000000 s`

## Gotchas

- This particular rate pair is friendlier than most real timelines because 30 fps divides 44.1 kHz cleanly.
- AAC can add encoder delay, so "perfect sync" in an MP4 means matching presentation timestamps, not byte-exact sample zero alignment after compression.
- Writing 150 full-HD PNGs is intentionally heavier than streaming raw frames, but it makes the sample-to-frame mapping easy to inspect.
