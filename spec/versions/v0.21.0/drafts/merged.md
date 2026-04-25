# v0.21.0 Merged Plan

The new authoring model is clip-first:

- `composition` is the whole video.
- `composition.clips[]` are top-level video segments and the AI authoring unit.
- Each clip owns local `anchors`.
- Each clip owns `tracks`.
- A track owns one or more `items`.
- `tts`, `subtitle_timeline`, and `subtitle` are explicit track kinds.
- `subtitle_timeline` reads the nftts word timeline and `subtitle` renders it.

The runtime remains flat so preview/export can continue to use the existing renderer.
