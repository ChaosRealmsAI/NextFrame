# NextFrame Architecture

## Product Flow

```text
examples/*/compositions/*.json
  -> nf-project validates component registry
  -> nf-project compiles source
  -> nf-cli verify reports JSON/component/timeline/layout risks
  -> nf-shell opens desktop editor
  -> frontend/nf-components previews and edits
  -> nf-cli/nf-shell saves composition patches
  -> nf-recorder renders source to MP4
```

## Module Map

- `crates/nf-cli`: AI-facing command surface. It opens projects, inspects DOM, patches, validates and verifies compositions, starts export, checks export status, and cancels export jobs.
- `crates/nf-shell`: desktop app shell. It owns windows, WebView IPC, project handlers, export job state, and process cleanup.
- `crates/nf-project`: storage, component registry validation, and compiler for projects, episodes, and v2 compositions.
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

## Component Contract

V2 component tracks reference project-local source files:

```text
examples/{project}/components/{component-id}.js
```

`nf-project` owns the registry contract before preview/export:

- component ids use lowercase letters, numbers, dots, and hyphens.
- each referenced component file must exist under `components/`.
- component source must export `mount` and `update`.
- component source must remain single-file and import-free.
- `nf composition validate` emits structured JSON with available components, used components, track usage, observed params, warnings, and errors.

The compiler still embeds source into `source.components`; preview and recorder load that same compiled source so validation, preview, and export stay on one contract.

## AI Verification Contract

`nf verify --project --composition` is the composition-level QA entry for AI-authored JSON.

It runs without opening the editor:

- loads the project and v2 composition from storage.
- runs `nf-project` component validation.
- compiles the same source used by preview/export.
- emits `timeline.ascii` so AI can inspect timing without screenshots.
- emits `checks[]` with `ok` / `warn` / `error` levels for component, timeline, layout, and text risks.
- emits `screenshot_plan[]` with deterministic open/capture commands for visual review.

The verifier does not mutate composition JSON and does not replace real pixel review. Its job is to catch machine-readable JSON problems first and point AI to the exact track/clip that needs repair.

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
