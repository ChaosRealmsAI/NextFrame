# nf-core — JavaScript engine core: timeline, animation, scenes, filters, and HTML build.

## Structure
- `engine/` — timeline validation, HTML build, keyframe interpolation, compose/render loop
- `animation/` — effects (fade, slide, scale, etc.) and transitions between clips
- `scenes/` — visual components organized by aspect ratio (16x9, 9x16, 4x3) and category (backgrounds, typography, data, media, overlays, shapes, browser)
- `filters/` — post-processing visual filters

## Key Files
- `engine/build.js` — core HTML builder: timeline JSON -> single-file playable HTML
- `engine/timeline.js` — timeline data model and manipulation
- `engine/validate.js` — 6-gate validation pipeline
- `engine/keyframes.js` — keyframe interpolation engine
- `scenes/meta.js` — scene metadata registry (describe, defaults, validate)
- `scenes/index.js` — scene component loader

## Rules
- Scene components are pure functions: `(ctx, t, params) -> canvas draws`. No side effects.
- Scenes must not cross-import from other scene categories or from `modules/`.
- No `var` (const/let only), no `console.log` in production code.
- Prod files must stay under 500 lines.
- All scene components must implement 4 interfaces: render, describe, defaults, validate.
