# `window.__onFrame` recorder contract

The web runtime exposes a synchronous frame-stepping contract for external recorders.

## Globals

### `window.__onFrame(timeSeconds, fps)`

- Parameters:
  - `timeSeconds`: finite `number`, the exact timeline time to render.
  - `fps`: requested recorder fps. The current implementation accepts it for compatibility and renders synchronously at `timeSeconds`.
- Behavior:
  - Sets `store.state.playhead = timeSeconds` directly, without dispatch history.
  - Switches the preview into recording mode so the rAF preview loop stays paused.
  - Calls `engine.renderAt(ctx, store.state.timeline, timeSeconds)` on the mounted preview canvas.
  - Returns `{ ok: true, t: timeSeconds }`.
- Errors:
  - Throws if the preview canvas/context is unavailable.
  - Throws if `timeSeconds` is not a finite number.

### `window.__onFrame_getImageData()`

- Returns a PNG data URL for the currently rendered preview canvas.
- This is a fallback for tests. Production recorders can continue to read pixels through the normal screen-capture path.

### `window.__onFrame_meta`

- Readonly object with live getters:
  - `width`: preview canvas backing-store width in pixels.
  - `height`: preview canvas backing-store height in pixels.
  - `duration`: current timeline duration in seconds.
  - `fps`: project fps when available, otherwise `30`.

## Notes

- The contract is pure ESM and is installed from `runtime/web/index.html` after `mountPreview(...)`.
- Once recording mode has been enabled by `__onFrame(...)`, the preview's autoplay loop remains paused until the app disables recording mode through the preview API.
