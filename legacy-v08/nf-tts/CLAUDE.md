# nf-tts — Agent-friendly TTS CLI with multi-backend synthesis and alignment.

## Build
cargo check -p nf-tts
cargo test -p nf-tts

## Structure
- `src/main.rs` + `src/cli/`: command parsing and subcommand entrypoints.
- `src/backend/`: Edge and Volcengine synthesis implementations.
- `src/queue/` + `src/output/`: batch jobs, manifests, events, SRT, and timeline files.
- `src/whisper/`: forced-alignment pipeline and timing model.
- `src/config.rs`, `src/lang.rs`, `src/cache/`: defaults, voice selection, and local cache.

## Rules
- Keep provider-specific behavior inside `backend/`; CLI commands use shared interfaces.
- Preserve subtitle text verbatim; timing comes from forced alignment, not text rewriting.
- Machine-readable outputs go through `output/`; do not print ad hoc status formats.
