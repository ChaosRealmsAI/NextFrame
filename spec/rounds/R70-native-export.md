# Task — R70: Native MediaRecorder export (replaces broken R25/R26 recorder integration)

## Goal
NextFrame's existing export pipeline (R24+R25+R26) tries to spawn MediaAgentTeam's recorder binary but the CLI args + __onFrame protocol don't match. Replace with a native browser-side export using `canvas.captureStream()` + `MediaRecorder` API. Output is a real WebM/MP4 file written via the bridge fs.write API.

## Requirements

### JS export (`runtime/web/src/export/native-export.js`)
- `export async function exportNative({store, engine, bridge, outputPath, fps = 30, mimeType = 'video/webm;codecs=vp9'}) → Promise<{ok, path, bytes}>`
- Algorithm:
  1. Create offscreen canvas at project resolution (`store.state.project.width × .height`)
  2. Get its 2D context via `engine.setupDPR(canvas)`
  3. Build a stream: `const stream = canvas.captureStream(fps)`
  4. Create `new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 6_000_000})`
  5. Collect blobs into chunks via `ondataavailable`
  6. Start recorder
  7. Walk timeline frame by frame: `for each frame f at t = f/fps from 0 to duration`:
     - `engine.renderAt(ctx, store.state.timeline, t)`
     - `await new Promise(r => requestAnimationFrame(r))` so the captureStream picks it up
  8. Stop recorder, await `onstop`
  9. Concatenate chunks into single Blob
  10. Convert blob to ArrayBuffer → base64 → call `bridge.call('fs.writeBinary', {path: outputPath, base64})`
  11. Return `{ok: true, path: outputPath, bytes: blob.size}`

### Bridge extension (`bridge/src/lib.rs`)
- New method `fs.writeBinary({path, base64})` — decode base64 and write bytes to path
- Same sandbox as fs.write
- Add unit test for round-trip

### Wire export dialog
- `runtime/web/src/export/dialog.js` — when user clicks Start, call `exportNative` instead of broken `bridge.call('export.start')`
- Show progress via dialog progress bar (estimate based on frame count vs total)
- Toast on success: "Exported {N}MB to {path}"
- Toast on error with reason

### Output
- Default path: `~/Movies/NextFrame/{projectName || 'untitled'}-{timestamp}.webm`
- WebM is fine (browser-native, plays in QuickTime via plugin or VLC); MP4 would need transcoding step

## Technical Constraints
- Pure browser APIs + bridge fs.writeBinary
- All existing tests must still pass
- The old broken `export.start` bridge method can stay for compat — just unwired from dialog.js

## Verification Commands
```bash
test -f runtime/web/src/export/native-export.js
grep -q 'exportNative' runtime/web/src/export/native-export.js
grep -q 'MediaRecorder' runtime/web/src/export/native-export.js
grep -q 'captureStream' runtime/web/src/export/native-export.js
grep -q 'exportNative' runtime/web/src/export/dialog.js
grep -q 'fs.writeBinary' bridge/src/lib.rs
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test -p bridge
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```

## Non-Goals
- NO MP4 transmuxing (WebM is the deliverable)
- NO audio mixing into the export (video-only for this round; R26's ffmpeg path stays)
- NO removing the broken R25 export.start bridge method (just don't use it from dialog)
