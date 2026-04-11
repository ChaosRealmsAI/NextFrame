# Task — R7: Top menu bar + `.nfproj` file operations

## Goal
Add a real top menu with File / Edit / View menus (HTML dropdowns, no native chrome). File menu supports New, Open, Save, Save As, Export for `.nfproj` files. Wire through the R3 bridge to actual fs read/write.

## Requirements

### HTML
- `runtime/web/index.html` top-menu bar (from R6) becomes an interactive menu
- File menu items: New, Open…, Save (Cmd+S), Save As…, Close, Export…
- Edit menu items: Undo (Cmd+Z), Redo (Cmd+Shift+Z), Cut/Copy/Paste (placeholders)
- View menu items: Zoom In/Out/Fit, Toggle Timeline, Toggle Inspector
- Dropdowns open on click, close on outside click or Esc
- Keyboard shortcuts wired (Cmd+S, Cmd+Shift+S, Cmd+N, Cmd+O)

### JS (`runtime/web/src/menu.js`)
- `export function initMenu({bridge, store})` — installs click + keyboard handlers
- On "New": reset the in-memory timeline to `{version:"1", duration:30, background:"#0b0b14", tracks: []}`
- On "Open…": call `bridge.call('fs.dialogOpen', {filters:['.nfproj']})` → read contents → `JSON.parse` → validate with engine's `validateTimeline` → load into store
- On "Save": if current path exists, `bridge.call('fs.write', {path, contents: JSON.stringify(timeline, null, 2)})`; else Save As…
- On "Save As…": call `bridge.call('fs.dialogSave', {defaultName:'Untitled.nfproj'})` → write

### Rust bridge update (`bridge/src/lib.rs`)
- Replace R3's stub for `fs.dialogOpen` and `fs.dialogSave` with a REAL implementation using `rfd` crate (`rfd = "0.14"`)
- Both dialogs must be non-blocking on the event loop — use `rfd::AsyncFileDialog` or spawn on a blocking thread and return a promise via a follow-up IPC message (choose simplest: blocking call from inside the webview ipc handler thread is OK for now)
- Path sandbox still enforced for `fs.read`/`fs.write` (inherit from R3)
- `fs.listDir` unchanged

### Unit tests
- `bridge/src/lib.rs` — add tests for `timeline.load` and `timeline.save` happy path
- Path sandbox tests still pass

### Minimal store
- `runtime/web/src/store.js` (may already exist in stub form; extend): `export const store = { state: {...}, subscribe(fn), mutate(fn) }` — tiny pub/sub
- Initial state: `{ timeline: {version:'1', duration:30, background:'#0b0b14', tracks:[]}, filePath: null, dirty: false }`
- `initMenu` uses store to flip `dirty` on any mutation

## Technical Constraints
- `rfd` is the ONLY new dependency allowed
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace`, `cargo test -p bridge` all pass
- No new JS dependencies, no bundler

## Verification Commands
```bash
grep -q '"rfd"' bridge/Cargo.toml
grep -q 'AsyncFileDialog\|FileDialog' bridge/src/lib.rs
test -f runtime/web/src/menu.js
test -f runtime/web/src/store.js
grep -q 'initMenu' runtime/web/src/menu.js
grep -q 'fs.dialogOpen' runtime/web/src/menu.js
grep -qE 'File|Edit|View' runtime/web/index.html
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
cargo test -p bridge
```

## Non-Goals
- NO actual drag-drop timeline editing (R13+)
- NO export MP4 (R24-R26)
- NO undo/redo (R18)
