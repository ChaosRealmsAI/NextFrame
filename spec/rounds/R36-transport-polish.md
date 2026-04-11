# Task — R36: Polished transport controls under preview

## Goal
The preview area currently has basic play/time indicators. Make them feel production-grade: large play/pause button, scrub bar (mini timeline), time display `00:00.00 / 00:30.00`, loop toggle, volume slider.

## Requirements

### JS (`runtime/web/src/preview/transport.js`)
- `export function mountTransport(container, { store, audioMixer })` inserts a row of controls into the bottom of the preview area
- Controls:
  - Big play/pause button (44x44, centered). Click → toggle `store.state.playing`
  - Time display: `HH:MM:SS.cs / HH:MM:SS.cs` (current / total), monospace, updated 30fps via rAF
  - Mini scrub bar showing playhead position as a filled bar (read-only); clicking jumps playhead
  - Loop toggle button (persists `store.state.loop`)
  - Volume slider (0-1, maps to `audioMixer.setMasterVolume` if available)
- Subscribes to store for playhead + playing changes

### Integration
- `runtime/web/index.html` — add `<div id="preview-transport">` below the preview canvas, mount via `mountTransport(el, {store, audioMixer})`
- CSS inline in transport.js or added to existing style block

### Visual
- Same dark palette
- Controls vertically centered in a 56px row
- Spacing: 24px between major controls

## Technical Constraints
- Pure ES modules
- No Rust changes
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace`, `node runtime/web/test/bdd/run.mjs` pass
- Does NOT regress R9 mountPreview or R11 boot playback

## Verification Commands
```bash
test -f runtime/web/src/preview/transport.js
grep -q 'mountTransport' runtime/web/src/preview/transport.js
grep -q 'mountTransport\|preview-transport' runtime/web/index.html
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
