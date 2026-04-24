# NextFrame · AI Entry

NextFrame is an AI-native video editor/runtime: structured JSON compositions render in the desktop editor and export to MP4.

## Run

```bash
cargo build -p nf-shell -p nf-cli
target/debug/nf-shell
target/debug/nf open --project v2-showcase --composition showreel-24s
```

Example projects live under `examples/`; runtime projects are copied to `~/.nextframe/`.

## AI 验证接口

`target/debug/nf open --project=<slug> --composition=<slug>` — open a v2 composition in the desktop editor.
`target/debug/nf screenshot --project=<slug> --episode=<slug> --region=editor --out=<png>` — capture a desktop editor region.
`target/debug/nf devtools --project=<slug> --episode=<slug> --query=<css> --get=<prop>` — inspect live DOM, including shadow DOM selectors.
`target/debug/nf composition show --project=<slug> --composition=<slug> [--track=<id>] [--field=<path>]` — read raw v2 composition JSON or one track field.
`target/debug/nf composition patch --project=<slug> --composition=<slug> --track=<id> --field=<path> --value=<json-or-string>` — patch one v2 track field such as `params.title`, `style.x`, or `time.start`.
`target/debug/nf export --project=<slug> --composition=<slug> --profile=draft|standard|final|final-fast --out=<mp4>` — export a v2 composition to MP4 with a named quality/speed profile.
`target/debug/nf export --project=<slug> --composition=<slug> --fps=30|60 --resolution=720p|1080p|4k --parallel=<1-8> --events --out=<mp4>` — override export settings and stream recorder progress JSONL before the final summary JSON.
`target/debug/nf export-status --job-id=<id>` — read desktop export job status, including `progress.percent`, frames, stage, and ETA.

## Current Focus

v0.11.0 is the export performance UX version: visible export profiles, real progress, and local parallel export while preserving saved JSON → source → MP4 consistency.

Specs and acceptance scenarios:

- `spec/versions/v0.11.0/spec.json`
- `spec/bdd/export-performance/feature.json`
