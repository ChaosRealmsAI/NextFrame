# nf-cut-core — Shared schemas, media helpers, and sentence-id contracts for the source pipeline crates.

## Build
`cargo check -p nf-cut-core`

## Module Structure
- `lib.rs`: public re-export surface that other crates consume as the contract
- `sentence.rs` / `srt.rs` / `time.rs`: canonical sentence, SRT, and timestamp utilities
- `plan.rs` / `cut_report.rs` / `preview.rs`: JSON contracts for planning, cut results, and preview timelines
- `media.rs` / `python.rs` / `fs.rs`: shared ffmpeg, Python, and filesystem helpers

## Key Constraints
- Treat the `lib.rs` re-exports as the stable contract; changing them affects every dependent crate.
- Sentence ids are the canonical addressing model across transcribe, align, cut, preview, and CLI flows.
- `Sentences::from_path()` accepts either a direct file or a directory containing `sentences.json`; keep that ergonomics intact.
- Time helpers define shared rounding and clamping behavior; changing `round2()`, millisecond conversion, or range rules will ripple through outputs and tests.
- Keep this crate generic: schemas and reusable helpers belong here, but workflow orchestration stays in the higher-level crates.
