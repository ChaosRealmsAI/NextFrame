# NextFrame Architecture

## Product Flow

```text
examples/*/compositions/*.json
  -> nf-project validates component registry and clip-local track structure
  -> nf-project compiles clip-first authoring JSON into render_source.v1
  -> nf-recorder validates render_source.v1 and renders MP4
  -> nf-cli verify reports JSON/component/timeline/layout risks
  -> nf-shell opens desktop editor
  -> frontend/nf-components previews and edits
  -> nf-cli/nf-shell saves composition patches
  -> nf-cli verify-export samples final MP4 frames against clip windows
```

## Module Map

- `crates/nf-cli`: AI-facing command surface. It opens projects, inspects DOM, patches, validates and verifies compositions, starts export, checks export status, and cancels export jobs.
- `crates/nf-shell`: desktop app shell. It owns windows, WebView IPC, project handlers, export job state, and process cleanup.
- `crates/nf-project`: storage, component registry validation, and compiler for projects, episodes, and compositions.
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

## Composition Contract

The current authoring model is clip-first:

```text
composition
  clips[]                 # top-level video segments
    anchors{}             # local names such as in, out, title-in
    tracks[]              # component / tts / subtitle_timeline / subtitle / audio
      items[]             # timed units inside the track
```

AI writes JSON at clip granularity. A clip is one video segment; it is not a small component fragment. The compiler then flattens clip-local tracks into the existing runtime `source.tracks[]` so preview and export keep one renderer path.

`tts` and `subtitle_timeline` are data tracks. `tts` points at generated audio and may declare the nftts metadata. `subtitle_timeline` points at the nftts word timeline. `subtitle` renders those words and should not carry a duplicated hand-written word timeline unless there is no TTS source.

Component tracks reference project-local source files:

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

## Export Contracts

There are two JSON contracts, and they must not be blurred:

```text
composition.json          # creative authoring protocol; AI writes this
  -> nf composition compile
render_source.json        # render protocol; recorder accepts this only
  -> nf-recorder export
video.mp4 + diagnostics
  -> nf verify-export
report.json
```

`composition.json` can contain clips, local anchors, tracks, TTS metadata, and subtitle timelines. It is allowed to be human/AI-friendly.

`render_source.v1` is resolved and machine-only:

- `schema_version = "nf.render_source.v1"`
- `duration_ms`
- numeric `begin_ms` / `end_ms` on every runtime clip
- `viewport.w` / `viewport.h`
- `theme.background` used behind transparent components
- `components` source registry
- `assets[]`

`nf-recorder` does not read project storage, desktop selection, composition JSON, or unresolved anchors. `nf export --project --composition` remains a compatible wrapper: it compiles composition JSON, writes the sibling source file, invokes recorder from source, then muxes audio where needed.

`nf verify-export --source --video --out` is the final MP4 guard. It samples clip midpoint frames from the MP4 and fails obvious visual regressions such as magenta canary background leakage or blank frames. This specifically protects the multi-clip export path where later clips can otherwise render with the wrong stage state.

## AI Verification Contract

`nf verify --project --composition` is the composition-level QA entry for AI-authored JSON.

It runs without opening the editor:

- loads the project and composition from storage.
- runs `nf-project` component validation.
- compiles the same source used by preview/export.
- emits `timeline.ascii` so AI can inspect timing without screenshots.
- emits `intent.overlap_policy=allowed-by-default`; multi-track overlap is normal video design and is not a verifier error by itself.
- emits `anchor_guide` so AI edits clip-local time with named anchors such as `in`, `title-in + 0.4s`, and `out` instead of raw numeric times.
- emits `checks[]` with `ok` / `warn` / `error` levels for component, timeline, layout, and text risks.
- emits `screenshot_plan[]` with deterministic open/capture commands for visual review.

The verifier does not mutate composition JSON and does not replace real pixel review. Its job is to catch machine-readable JSON problems first, avoid false positives from normal layered design, and point AI to the exact track/clip that needs repair.

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
