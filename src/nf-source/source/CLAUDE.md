# nf-source — User-facing CLI for the source pipeline: download, transcribe, align, cut, preview.

## Build
`cargo check -p nf-source`

## Core Constraints
- Keep `main.rs` and `cmd_*.rs` as thin adapters over the library crates in `src/crates/`.
- Cut operations address content by sentence ids, not raw timestamps.
- Commands should keep stdout machine-readable: JSON summaries or streamed event lines.
- Shared flag contracts live in `cli.rs`; avoid duplicating parsing logic inside commands.

## Module Structure
- `main.rs`: command dispatch
- `cli.rs`: clap models and user-facing workflow contract
- `cmd_download.rs`: yt-dlp wrapper via `nf-download`
- `cmd_transcribe.rs` / `cmd_align.rs`: speech-to-sentences pipelines
- `cmd_cut.rs` / `cmd_preview.rs`: sentence-plan cutting and HTML preview generation
