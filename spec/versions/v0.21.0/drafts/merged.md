# v0.21.0 Implementation Plan

Use `nextframe.composition.v3` as the only documented authoring model.

Implementation decisions:
- Authoring JSON is clip-first: `composition.clips[].tracks[].items[]`.
- Clip anchors are local; compiler offsets them into global runtime milliseconds.
- Track kinds are `component`, `tts`, `audio`, `subtitle_timeline`, and `subtitle`.
- `tts` emits runtime audio tracks.
- `subtitle_timeline` reads `nf-tts` timeline JSON and is a source track, not a rendered layer.
- `subtitle` emits runtime subtitle tracks by referencing a `subtitle_timeline` item.
- The runtime source remains flat `tracks[].clips[]` so recorder changes stay small.
- Frontend uses the raw v3 composition for the left clip list and clip-local timeline, while preview/export use compiled runtime source.
- Public docs stop teaching old episode/clips commands.

No compatibility migration is required.
