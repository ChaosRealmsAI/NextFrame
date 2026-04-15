# nf-guide — Rust CLI for pipeline recipe guides.

## Trigger Conditions
- Read this file before editing `src/nf-guide/`.
- Read this file when changing recipe discovery, CLI argument handling, or markdown output behavior.

## Build
cargo check -p nf-guide

## Test
cargo run -p nf-guide
cargo run -p nf-guide -- produce
cargo run -p nf-guide -- produce ratio

## Structure
- `src/lib.rs`: recipe discovery, JSON loading, markdown lookup.
- `src/main.rs`: small CLI that prints guide or step markdown to stdout.
- `recipes/`: filesystem recipe assets loaded from `NF_GUIDE_RECIPES` or the repo default path.

## Common Mistakes
- Adding dependencies beyond `serde` and `serde_json`.
- Baking in repo-specific absolute paths instead of using the configured recipes dir.
- Returning formatted help text from the library instead of raw recipe content.
