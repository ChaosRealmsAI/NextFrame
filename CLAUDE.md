# NextFrame · AI Entry

NextFrame is an AI-native video editor/runtime: structured JSON compositions render in the desktop editor and export to MP4.

## Run

```bash
cargo build -p nf-shell -p nf-cli
target/debug/nf-shell
target/debug/nf open --project v2-showcase --composition showreel-clip-first
```

Example projects live under `examples/`; runtime projects are copied to `~/.nextframe/`.

## AI 验证接口

`target/debug/nf open --project=<slug> --composition=<slug>` — open a composition in the desktop editor.
`target/debug/nf screenshot --project=<slug> --episode=<slug> --region=editor --out=<png>` — probe a desktop editor region and write a size stub PNG; use `capture` for visual evidence.
`target/debug/nf capture --project=<slug> --episode=<slug> --out=<png>` — capture the native macOS window PNG for real visual verification.
`target/debug/nf click --project=<slug> --episode=<slug> --selector=<css>` — simulate a real desktop click, including shadow DOM selectors.
`target/debug/nf devtools --project=<slug> --episode=<slug> --query=<css> --get=<prop>` — inspect live DOM, including shadow DOM selectors.
`target/debug/nf devtools --project=<slug> --episode=<slug> --query=<css> --fill=<value> [--get=<prop>]` — fill a live input through the same input/change path as human editing.
`target/debug/nf composition show --project=<slug> --composition=<slug> [--clip=<id>] [--track=<id>] [--item=<id>] [--field=<path>]` — read raw composition JSON or one clip/track/item field.
`target/debug/nf composition patch --project=<slug> --composition=<slug> [--clip=<id>] --track=<id> [--item=<id>] --field=<path> --value=<json-or-string>` — patch one track or clip item field such as `params.title`, `style.x`, or `time.start`.
`target/debug/nf composition validate --project=<slug> --composition=<slug>` — validate component registry, files, mount/update exports, import-free ABI, used tracks, and observed params.
`target/debug/nf composition compile --project=<slug> --composition=<slug> --out=<render_source.json>` — compile AI-authored composition JSON into stable `nf.render_source.v1` recorder input.
`target/debug/nf verify --project=<slug> --composition=<slug> [--out=<json>] [--screenshot-dir=<dir>]` — verify AI-authored composition JSON: component ABI, compiled source, overlap intent, anchor guide, ASCII timeline, layout/text checks, and typical screenshot commands.
`target/debug/nf-recorder validate-source --source=<render_source.json>` — validate recorder input contract without reading project storage or desktop state.
`target/debug/nf-recorder export --source=<render_source.json> --profile=draft|standard|final|final-fast --output=<mp4> [--diagnostics=<json>]` — export directly from render source through the recorder module.
`target/debug/nf-recorder snapshot-source --source=<render_source.json> --t-ms=<ms> --output=<png>` — sample one render-source frame through the same recorder HTML/runtime path.
`target/debug/nf export --project=<slug> --composition=<slug> --profile=draft|standard|final|final-fast --out=<mp4>` — export a composition to MP4 with a named quality/speed profile.
`target/debug/nf export --project=<slug> --composition=<slug> --profile=draft --diagnostics --out=<mp4>` — export and write a sibling diagnostics JSON with frame timings, slow spans, and top slow frames.
`target/debug/nf export --project=<slug> --composition=<slug> --fps=30|60 --resolution=720p|1080p|4k --parallel=<1-8> --events --out=<mp4>` — override export settings and stream recorder progress JSONL before the final summary JSON.
`target/debug/nf verify-export --source=<render_source.json> --video=<mp4> --out=<report.json>` — sample exported MP4 clip frames and fail on magenta-background or blank-frame regressions.
`target/debug/nf export-status --job-id=<id>` — read desktop export job status, including progress and diagnostics summary/path when available.
`target/debug/nf export-cancel --job-id=<id>` — cancel a running desktop export job and stop its recorder process group.
`./scripts/check-structure.sh` — verify repository skeleton: root allowlist, no nested spec git, no tracked generated artifacts.

## Directory Boundaries

- `crates/`: Rust product code.
- `frontend/nf-components/`: zero-framework editor Web Components.
- `examples/`: source examples for local product runs.
- `scripts/`: checks and maintenance utilities.
- `tests/`: cross-module fixtures.
- `spec/`: BDD, version records, devlog, standards, design, architecture.

Do not write generated videos, screenshots, node_modules, Cargo targets, or one-off research output into tracked source. Use `tmp/` only as ignored scratch; long-lived local archives belong in `../NextFrame.archive/`.

## Current Focus

v0.22.0 hardens export contracts: AI writes `composition.json`, `nf composition compile` emits `render_source.v1`, `nf-recorder` accepts only that source contract, and `nf verify-export` checks final MP4 frames against clip windows.

Specs and acceptance scenarios:

- `spec/bdd/clip-first-export/feature.json`
- `spec/bdd/clip-first-export/contracts/render-source-v1.md`
