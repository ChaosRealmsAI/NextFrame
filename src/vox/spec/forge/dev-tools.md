# vox Dev Tools

## Purpose

This project is a Rust CLI, so the first verification layer is local unit tests and CLI smoke checks. The real TTS path is network-dependent because Edge synthesis in [src/backend/edge/ws.rs](/Users/Zhuanz/boom/vox/src/backend/edge/ws.rs) talks to the live service.

## Fast Verification

Run the unit suite:

```bash
cargo test --quiet
```

Useful local checks before or after doc/code changes:

```bash
cargo run -- --help
cargo run -- voices --lang en
```

## Real TTS Smoke Test

Single-shot synthesis exercises the real backend, cache, naming, and optional subtitle path.

```bash
mkdir -p tmp/vox-smoke
cargo run -- synth "vox smoke test" -d tmp/vox-smoke --voice en-US-EmmaMultilingualNeural
```

Expected artifacts:

- MP3 output under `tmp/vox-smoke/`
- cache entry under `tmp/vox-smoke/.vox-cache/`
- JSON status lines on stdout from [src/output/event.rs](/Users/Zhuanz/boom/vox/src/output/event.rs)

To verify subtitle generation:

```bash
cargo run -- synth "subtitle smoke test" -d tmp/vox-smoke --voice en-US-EmmaMultilingualNeural --srt
```

If the backend returns word boundaries, a sibling `.srt` file is written by [src/output/srt.rs](/Users/Zhuanz/boom/vox/src/output/srt.rs).

## Batch Test

Batch mode should validate default resolution, per-job voice/backend overrides, output naming, manifest writing, and non-zero exit behavior on failure.

Example input:

```json
[
  { "id": 0, "text": "hello from batch" },
  { "id": 1, "text": "custom voice", "voice": "en-US-AvaNeural", "filename": "custom.mp3" }
]
```

Save that as `tmp/vox-batch/jobs.json`, then run:

```bash
mkdir -p tmp/vox-batch/out
cargo run -- batch tmp/vox-batch/jobs.json -d tmp/vox-batch/out
```

Expected artifacts:

- output MP3 files in `tmp/vox-batch/out/`
- `tmp/vox-batch/out/manifest.json`
- NDJSON job events plus a final JSON summary

Dry-run planning is available without network calls:

```bash
cargo run -- batch tmp/vox-batch/jobs.json -d tmp/vox-batch/out --dry-run
```

## Config Checks

Config persistence lives in [src/config.rs](/Users/Zhuanz/boom/vox/src/config.rs). Useful manual checks:

```bash
cargo run -- config set voice zh-CN-YunxiNeural
cargo run -- config set alias.narrator en-US-EmmaMultilingualNeural
cargo run -- config get
```

## Caveats

- `preview` in [src/cli/preview.rs](/Users/Zhuanz/boom/vox/src/cli/preview.rs) is Edge-only.
- `play` and `preview` need a local audio player.
- `concat` in [src/cli/concat.rs](/Users/Zhuanz/boom/vox/src/cli/concat.rs) is only a byte append, so use it as a convenience check rather than a mastering pipeline.
