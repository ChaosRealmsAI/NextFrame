# Task — R16: Delete / Copy / Paste / Duplicate + global keyboard shortcuts

## Goal
Add keyboard shortcuts and commands for clip lifecycle: Delete/Backspace removes selected clips; Cmd+C copies; Cmd+V pastes at playhead; Cmd+D duplicates; all undoable via the dispatcher.

## Requirements

### Commands (`runtime/web/src/commands.js`)
- `removeClipCommand({clipId})` — captures clip + trackId, removes, undo restores at original position
- `removeClipsCommand({clipIds})` — composite that removes multiple, single-undo
- `pasteClipsCommand({clips, targetStart, trackId})` — insert clones at playhead, generating new ids
- `duplicateClipsCommand({clipIds})` — composite of pasteClipsCommand right after original clips

### Clipboard (`runtime/web/src/clipboard.js`)
- In-memory clipboard (not system clipboard) — stores last copied clip array
- `copy(clips)`, `read()`

### Keyboard (`runtime/web/index.html` onKeyDown handler)
- Delete / Backspace → remove selected clips
- Cmd+C / Ctrl+C → copy selected clips into clipboard
- Cmd+V / Ctrl+V → paste clipboard at current playhead (picks first video track)
- Cmd+D / Ctrl+D → duplicate selected clips
- Cmd+X / Ctrl+X → cut (copy + remove)
- Cmd+A → already wired by R15 (select all)

### Guard rails
- If nothing selected, Delete is a no-op
- If clipboard empty, Paste is a no-op
- Overlap check on paste — if target range is occupied, try next available 0.1s increment forward

## Technical Constraints
- Pure ES modules, no deps
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace` pass
- No regression

## Verification Commands
```bash
test -f runtime/web/src/clipboard.js
grep -q 'removeClipCommand\|removeClips' runtime/web/src/commands.js
grep -q 'pasteClipsCommand\|pasteClips' runtime/web/src/commands.js
grep -q 'duplicateClipsCommand\|duplicateClips' runtime/web/src/commands.js
grep -qE 'Delete|Backspace' runtime/web/index.html
grep -qE 'copy|paste|duplicate' runtime/web/src/clipboard.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
```

## Non-Goals
- NO system-clipboard integration
- NO cut-and-paste across files
