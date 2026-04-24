# NextFrame Architecture

## Product Flow

```text
examples/*/compositions/*.json
  -> nf-project compiles source
  -> nf-shell opens desktop editor
  -> frontend/nf-components previews and edits
  -> nf-cli/nf-shell saves composition patches
  -> nf-recorder renders source to MP4
```

## Module Map

- `crates/nf-cli`: AI-facing command surface. It opens projects, inspects DOM, patches compositions, starts export, checks export status, and cancels export jobs.
- `crates/nf-shell`: desktop app shell. It owns windows, WebView IPC, project handlers, export job state, and process cleanup.
- `crates/nf-project`: storage and compiler for projects, episodes, and v2 compositions.
- `crates/nf-recorder`: export engine that drives the runtime and encodes MP4.
- `crates/nf-shell-mac`: macOS capture bridge used by recorder and shell capture paths.
- `frontend/nf-components`: zero-framework Web Components for topbar, timeline, preview, inspector, and editing events.
- `examples/v2-showcase`: current source example for high-ceiling component compositions.

## Dependency Direction

```text
nf-cli -> nf-project, nf-recorder, shell IPC
nf-shell -> nf-project, frontend assets, export child process
nf-recorder -> nf-shell-mac
frontend -> shell IPC only
examples -> consumed by project/runtime code
spec -> documentation and acceptance; no runtime dependency
```

Forbidden directions:

- frontend must not depend on Rust internals.
- recorder must not mutate composition JSON.
- export must not use a different source than preview/editor save paths.
- generated artifacts must not become source dependencies.

## Repository Skeleton

Root directories are intentionally few:

- `crates/`
- `frontend/`
- `examples/`
- `scripts/`
- `tests/`
- `spec/`
- `.github/`

Everything else should be hidden build cache, ignored scratch, or outside the repository archive.
