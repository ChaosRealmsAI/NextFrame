# nf-runtime — Browser editor UI loaded inside WKWebView.

## Trigger Conditions
- Read this file before editing `src/nf-runtime/web/src/core/`, `src/nf-runtime/web/src/components/`, `src/nf-runtime/web/src/editor/`, `src/nf-runtime/web/src/ui/`, `src/nf-runtime/web/src/preview/`, or `src/nf-runtime/web/src/pipeline/`.
- Read this file when adding browser-visible functions, moving code between runtime folders, or changing `src/nf-runtime/web/index.html`.
- Update this file when AI tries an ES module refactor or import cleanup that would break global access or script load order.

## Build
No standalone build step. The runtime is loaded directly from `src/nf-runtime/web/index.html` via script tags inside WKWebView.

## Structure
- `web/src/core/`: runtime engine and shared utilities.
- `web/src/components/`: scene components used by preview and editor flows.
- `web/src/editor/`: editor pages and app boot/state.
- `web/src/ui/`: shared widgets and interaction helpers.
- `web/src/preview/`: preview playback and timeline rendering.
- `web/src/pipeline/`: pipeline-stage pages and helpers.

## Rules
- Keep browser entrypoints globally accessible when other scripts or inline handlers call them: attach to `window`, not only ES module scope.
- Treat folder boundaries as load-time contracts; avoid importing across module boundaries unless the existing runtime already does so safely.
- When adding, removing, or reordering scripts, preserve dependency order in `src/nf-runtime/web/index.html`.

## Common Mistakes
- Importing across module boundaries in ways that bypass the current script-tag loading model.
- Breaking script load order in `src/nf-runtime/web/index.html`.
