# Task — R52: Aspect ratio presets (YouTube/TikTok/Instagram)

## Goal
Let user switch project aspect ratio from a preset dropdown: 16:9 (YouTube), 9:16 (TikTok/Shorts), 1:1 (Instagram), 4:5 (Instagram Portrait), 21:9 (Cinematic). Preview canvas + letterbox adapt instantly.

## Requirements

### Presets (`runtime/web/src/project/presets.js`)
- `export const ASPECT_PRESETS = [{id, name, ratio, width, height}, ...]`
  - `youtube-16-9`: 1920×1080, "16:9 YouTube"
  - `tiktok-9-16`: 1080×1920, "9:16 TikTok / Shorts"
  - `instagram-1-1`: 1080×1080, "1:1 Instagram Square"
  - `instagram-4-5`: 1080×1350, "4:5 Instagram Portrait"
  - `cinema-21-9`: 2560×1080, "21:9 Cinematic"

### Inspector project section
- When nothing selected, Inspector shows "Project" section with aspect preset dropdown
- Selecting a preset updates `store.state.project.width/height/aspectRatio` via dispatch (undoable)
- Preview canvas R9 letterbox automatically recomputes via existing ResizeObserver

### Menu
- View > Aspect > submenu of presets (click to switch)

### Persistence
- Saved in .nfproj as `project: {width, height, aspectRatio}`

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/project/presets.js
grep -q 'ASPECT_PRESETS' runtime/web/src/project/presets.js
grep -qE 'ASPECT_PRESETS|aspectPreset' runtime/web/src/panels/inspector/
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
