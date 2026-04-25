# NextFrame Charter

NextFrame turns structured JSON atoms into editable, verifiable, and exportable video.

## North Star

An AI agent can create a composition, verify the JSON, open it in the desktop editor, change text/style/timing, preview the result, and export the same saved source to MP4.

## Product Principles

- JSON is the source of truth.
- AI-authored JSON must be self-verifiable before a human is asked to judge it.
- Preview and export must use the same compiled source.
- HTML/CSS/SVG/Canvas/JS components are first-class video building blocks.
- The desktop editor is an inspection and authoring surface for AI-generated compositions, not a pile of feature-specific tabs.
- Local export must be interruptible and conservative by default.
- Repository structure must stay simple enough for a new AI or engineer to navigate without oral context.

## Current User

Primary user: a PM/operator working with AI agents to produce video from structured ideas.

Secondary user: AI coding agents that need stable CLI verification and clear repository boundaries.

## Terms

- Composition: one JSON video document under `examples/*/compositions/`.
- Clip: one video segment inside a composition. This is the AI authoring unit.
- Anchor: a named time point scoped to one clip unless explicitly documented otherwise.
- Track: one lane inside a clip. Tracks have `kind` values such as `component`, `tts`, `subtitle_timeline`, `subtitle`, or `audio`.
- Item: one timed unit inside a track.
- Component: HTML/SVG/Canvas/JS module mounted by the runtime.
- Source: compiled export/preview JSON consumed by the runtime and recorder.
- Archive: local non-source material stored outside the repo at `../NextFrame.archive/`.
