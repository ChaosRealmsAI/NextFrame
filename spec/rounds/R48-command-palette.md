# Task — R48: Cmd+K command palette

## Goal
A fast keyboard-driven command launcher (like VS Code / Linear / Raycast). Cmd+K opens a modal with fuzzy-searchable commands: New, Open, Save, Export, Toggle Blade, Zoom In/Out/Fit, Select All, Delete, Undo, Redo, Toggle Help, etc.

## Requirements

### JS (`runtime/web/src/command-palette.js`)
- `export function mountCommandPalette({store, bridge, commands})` registers Cmd+K keyboard handler
- Opens a modal (centered, 640px wide, 400px tall):
  - Text input at top with placeholder "Type a command..."
  - Scrollable list of commands filtered by query (simple substring fuzzy match)
  - Up/Down arrow keys move selection
  - Enter executes selected command
  - Esc closes modal
- Commands registered via a simple map: `{id, label, shortcut?, run: () => void}`
- Pre-registered commands (at least 15):
  - File: New Project, Open, Open Recent, Save, Save As, Export, Close
  - Edit: Undo, Redo, Cut, Copy, Paste, Delete, Duplicate, Select All
  - View: Zoom In, Zoom Out, Zoom Fit, Toggle Safe Area, Toggle FPS, Toggle Help
  - Timeline: Blade Tool, Move Tool, Add Video Track, Add Audio Track
  - Scene: Randomize Params
- Commands exposed via `window.__commandPalette` for introspection

### Integration
- `runtime/web/index.html` — import and call mountCommandPalette after other mounts
- Cmd+K / Ctrl+K opens/closes
- Background dim on open

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/command-palette.js
grep -q 'mountCommandPalette' runtime/web/src/command-palette.js
grep -q 'mountCommandPalette' runtime/web/index.html
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
