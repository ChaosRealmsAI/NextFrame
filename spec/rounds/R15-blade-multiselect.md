# Task — R15: Blade (split) tool + multi-select

## Goal
Two features: (1) Blade tool to split a clip at a time point, (2) Multi-select via Shift+Click and marquee drag.

## Requirements

### Blade
- Tool palette button (or keyboard shortcut `B`) toggles Blade mode
- In Blade mode, cursor is `crosshair`, clicking inside a clip at X splits the clip at that time:
  - Original clip truncated to `[start, splitTime)`
  - New clip created at `[splitTime, original_end)` with same scene/params
  - Both clips added to same track
- `splitClipCommand({clipId, splitTime})` in commands.js (undoable)
- Keyboard Cmd+B = split all selected clips at current playhead

### Multi-select
- Shift+Click on a clip adds it to selection (`store.state.selection.clipIds` — use Set/array)
- Marquee drag on empty timeline area creates a selection rectangle; clips whose bounds intersect rectangle get selected
- Cmd+A selects all clips on the active track
- Click on empty area clears selection
- Selected clips get visual highlight (different from single-selected)

### Store changes
- Extend selection model: `selection.clipIds` (array of ids) — backwards-compat with single `selectedClipId`
- When marquee selection finalizes, dispatch a command for undo history

### Visual
- Blade indicator: vertical line follows cursor while in Blade mode within a track
- Marquee: dashed blue rectangle while dragging

## Technical Constraints
- Pure ES modules
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo build --workspace` pass
- No regression of R13/R14

## Verification Commands
```bash
grep -q 'splitClipCommand\|splitClip' runtime/web/src/commands.js
grep -q 'marquee' runtime/web/src/timeline/
grep -qrE 'Blade|blade' runtime/web/src/timeline/
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
```

## Non-Goals
- NO ripple delete
- NO linked clips
