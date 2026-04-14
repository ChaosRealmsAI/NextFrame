# nf-transcribe — Transcribe media with Whisper helpers, chunk long audio, and emit canonical sentence artifacts.

## Build
`cargo check -p nf-transcribe`

## Module Structure
- `lib.rs`: orchestrates extraction, chunk transcription, merge/dedup, and bundle writing
- `chunk.rs`: plans chunk WAVs with overlap for long inputs
- `audio.rs`: ffmpeg-based WAV slicing helpers
- `logger.rs`: mirrored stderr and `log.txt` progress logging
- `scripts/whisper_transcribe.py`: Python helper contract consumed by `run_whisper_script()`

## Key Constraints
- Keep output bundle names stable: `audio.wav`, `sentences.json`, `sentences.srt`, `sentences.txt`, `words.json`, `meta.json`, `log.txt`.
- Chunking is intentionally fixed at 20 minutes with 2 seconds of overlap; merged words are deduped by overlap cutoff, so adjust carefully.
- Extracted audio and chunk slices must stay 16 kHz mono WAV to match the helper script contract.
- Helper resolution lives in `whisper_script_path()`: `VIDEOCUT_WHISPER_SCRIPT`, then `scripts/whisper_transcribe.py`, with Python from `VIDEOCUT_PYTHON_BIN` or fallback.
- Concurrency is bounded through Rayon with `jobs.max(1).min(chunks.len().max(1))`; keep results ordered before merging.
