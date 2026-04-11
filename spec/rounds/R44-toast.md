# Task — R44: Toast notification system

## Goal
Lightweight toast notifications that appear in the bottom-right corner, stack vertically, auto-dismiss after 3s. Used for save success, export done, errors, etc.

## Requirements

### JS (`runtime/web/src/toast.js`)
- `export function toast(message, { type = 'info', duration = 3000 } = {})` — shows a toast
- Types: `info` (default), `success` (green), `warn` (amber), `error` (red)
- Container: `#toast-root` div injected into body on first call (idempotent)
- Stacking: newest on top, max 5 visible, older ones slide down
- Fade-in on enter (200ms), fade-out on exit (300ms)
- `export function clearToasts()` — dismisses all

### Integration points
- `runtime/web/src/menu.js` — on save success: `toast('Saved.', {type:'success'})`; on error: `toast(err.message, {type:'error'})`
- `runtime/web/src/export/dialog.js` — on export complete: `toast('Export complete', {type:'success', duration:5000})`
- Load / new project: info toasts

### Style
- Rounded 8px, dark bg #14141e, 12px padding, 280px max-width, subtle shadow
- Color stripe on left based on type (4px)
- Monospace not required; system font OK
- Positioned `fixed` bottom-right, 24px margin

## Technical Constraints
- Pure ES modules, no deps
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/toast.js
grep -q 'export function toast' runtime/web/src/toast.js
grep -qE 'toast\(' runtime/web/src/menu.js
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
