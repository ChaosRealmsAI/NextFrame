# Task — R54: Functional track mute / solo / lock

## Goal
Make the track header icons (mute/lock) functional. Add a solo button. State persisted in track object. Muted tracks don't render in preview, locked tracks reject drag/edit.

## Requirements

### Store
- `track.muted: bool` (default false)
- `track.locked: bool` (default false)
- `track.solo: bool` (default false) — when ANY track is solo, only solo tracks render

### Track header (`runtime/web/src/timeline/track.js`)
- Update header icons to be clickable buttons
- Mute (M): toggle `track.muted`, visual: filled volume-off icon when muted
- Solo (S): toggle `track.solo`, visual: filled "S" badge when solo
- Lock (L): toggle `track.locked`, visual: filled padlock when locked

### Engine (`runtime/web/src/engine/index.js`)
- `renderAt` skips clips on tracks where `track.muted === true`
- `renderAt` honors solo: if any track has `solo === true`, only render solo tracks (still respect mute)

### Audio mixer (`runtime/web/src/audio/mixer.js`)
- Audio tracks with `muted=true` skip scheduling
- Solo logic same as engine

### Drag/edit guards
- `clip-interact.js` (move/resize) — if `track.locked`, ignore mousedown
- `dnd/target.js` — drop targets on locked tracks reject

### Commands
- `setTrackFlagCommand({trackId, flag, value})` — undoable

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
grep -qE 'muted|solo|locked' runtime/web/src/timeline/track.js
grep -qE 'muted' runtime/web/src/engine/index.js
grep -qE 'muted' runtime/web/src/audio/mixer.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
