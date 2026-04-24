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
`target/debug/nf export --project=<slug> --composition=<slug> --out=<mp4>` — export a v2 composition to MP4.

## Current Focus

v0.10.0 is the v2 composition authoring version: timeline track selection, real JSON inspector, live preview edits, save persistence, and export parity.

Specs and acceptance scenarios:

- `spec/versions/v0.10.0/spec.json`
- `spec/bdd/v2-editor-authoring/feature.json`
