# v0.14.0 Build Approach

## Decision

Keep the v2 source contract stable: `audio` and `subtitle` are normal tracks in the same composition JSON, not a separate clip system.

The implementation should make desktop preview and export consume the same compiled source shape:

- `audio` track compiles to `clips[].params.src/from_ms/to_ms/volume`.
- `subtitle` track compiles to `clips[].params.source.words` and `clips[].params.style`.
- Runtime/editor still edits the raw composition JSON through `params.words`, `style.*`, and `time.*`.

## Work Split

1. Add `subtitle-main` to `showreel-24s.json`, with `params.words` and `style`.
2. Normalize compiled subtitle source into editor clips so the timeline gets a real subtitle row.
3. Render active v2 subtitle overlays in desktop preview beside component tracks.
4. Let inspector render any v2 track, not only component tracks.
5. Fix dotted array patch paths such as `params.words.0.text`; otherwise CLI and future inspector controls cannot edit one caption in place.
6. Verify export sidecar has subtitle/audio tracks, ffprobe sees AAC audio, and an exported frame contains subtitle pixels.

## Constraints

- No iframe.
- No new frontend framework.
- No tracked generated audio/video artifacts.
- Generated verification media goes to `../NextFrame.archive/`.
