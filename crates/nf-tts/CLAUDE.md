# nf-tts — Agent-friendly TTS CLI · multi-backend · whisperX alignment · self-contained karaoke.

## Usage (AI-first)

Run `nf-tts --help` FIRST · it's a 160-line playbook covering voice selection, punctuation-as-pause,
rate/pitch recommendations, DURATION ESTIMATION table, Edge limitations, common mistakes. Designed so
an AI agent can use the CLI zero-shot without reading source. Validated via sonnet blind test 9/10.

## Default output (4 files · flat into -d · since v1.12.2)
  <stem>.mp3            audio (24kHz mono · Edge default)
  <stem>.timeline.json  { duration_ms, voice, words[{text,start_ms,end_ms}], segments }
  <stem>.srt            SubRip subtitles
  <stem>.karaoke.html   self-contained word-highlight player (double-click to open)

Flags: `--no-sub` audio only · `--subdir` nested legacy layout · `--rate -10%` bare OK (v1.12.4).

## Build
cargo check -p nf-tts
cargo test -p nf-tts --all-targets       # 50 tests
cargo clippy -p nf-tts --release --all-targets -- -D warnings

## Structure
- `src/main.rs` + `src/cli/`: clap parsing · mod.rs has LONG_ABOUT (160-line help)
- `src/backend/`: edge (WS) + volcengine (HTTP) + Backend trait
- `src/queue/` + `src/output/`: batch jobs · manifests · events · SRT · karaoke HTML (include_str!)
- `src/whisper/`: forced-alignment pipeline · Timeline { words[], segments[] } dual schema
- `src/config.rs`, `src/lang.rs`, `src/cache/`: defaults · voice selection · sha2 cache

## Rules
- Provider-specific stays in `backend/`; CLI uses shared interfaces
- Subtitle text verbatim; timing from forced alignment only
- All stdout JSON events (one-per-line) go through `output/event.rs`
- `status: done` `duration_ms` is the ALIGNED duration (v1.12.5) · matches timeline.json
- Authoritative duration source: `timeline.json` > `ffprobe` > `status: done` (always agree post-v1.12.5)

## Migration (v0.8 → v1.12)
Source: `archive/v0.8-legacy.tar.gz` (legacy-v08/nf-tts/) · integrated to workspace in v1.12.0 ·
workspace.lints.clippy inherited (v1.12.1) · no business-logic rewrites; only wiring + schema flatten.
