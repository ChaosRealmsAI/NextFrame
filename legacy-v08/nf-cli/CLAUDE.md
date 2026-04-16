# nf-cli — Node.js CLI for timeline, project, pipeline, render, and app workflows.

## Trigger Conditions
- Read this file before editing `src/nf-cli/src/commands/`, `src/nf-cli/src/scenes/`, `src/nf-cli/src/fx/`, or `src/nf-cli/src/engine/`.
- Read this file when adding or changing a CLI command, a scene component, scene validation, preview behavior, or aspect-ratio-specific component wiring.
- Update this file when AI reaches for an ad hoc script or manual inspection, but `nextframe scenes`, `nextframe validate`, or `nextframe preview` already solves the task.

## Build
node src/nf-cli/bin/nextframe.js --help

## Test
cd src/nf-cli && node --test test/index.js

## Structure
- `src/commands/`: 40+ CLI commands grouped by domain.
- `src/scenes/`: scene component library; this module owns 50 components plus scene contracts and metadata.
- `src/fx/`: effects, filters, and transitions.
- `src/engine/`: legacy and v2 timeline/render/validate engines.

## Tools AI Should Know About
- `nextframe scenes`: inspect available scenes, params, and contracts before choosing or editing a component.
- `nextframe validate`: run after every timeline or scene edit; do not treat an edit as done before validation passes.
- `nextframe preview`: verify layout and rendered output after structural scene changes.

## Common Mistakes
- Using the wrong component variant for the target aspect ratio, especially when `_43` or `_portrait` variants exist.
- Editing scene or timeline data and skipping `nextframe validate` afterward.
