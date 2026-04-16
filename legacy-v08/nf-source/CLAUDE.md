# nf-source — Source media pipeline: download, transcribe, align, and cut.

## Build
```bash
cargo check -p nf-source -p nf-align -p nf-transcribe -p nf-download -p nf-cut
cargo test -p nf-source -p nf-align -p nf-transcribe -p nf-download -p nf-cut
```

## Structure
- `source/` — CLI dispatcher and pipeline orchestration
- `download/` — video download with yt-dlp backend
- `transcribe/` — ASR via Whisper helper script
- `align/` — SRT alignment against source video
- `cut/` — clip extraction from source video
- `core/` — shared types: SRT, sentences, time utilities

## Rules
- Each sub-crate is independently testable.
- External tools (ffmpeg, whisper, yt-dlp) are called via subprocess, not linked.
- Output artifacts follow fixed naming: audio.wav, sentences.json, sentences.srt.
