# Task — R43: Project stats bar

## Goal
Show a compact stats strip at the bottom of the timeline panel: total clips, total duration (mm:ss), scene count by category, dirty state indicator.

## Requirements

### JS (`runtime/web/src/timeline/stats-bar.js`)
- `export function mountStatsBar(container, store)` inserts a single-line stats row
- Content: `45 clips · 00:30 · 3 bg · 5 typography · 2 overlays  •  saved` (pipe separators, dot prefix for dirty)
- Subscribes to store.state.timeline + .dirty; re-renders on change
- Position: below the bottom timeline panel (new div with class `timeline-stats`)
- Style: 24px tall, monospace, dim text (#6b7280), small padding

### Integration
- `runtime/web/index.html` — add `<div id="timeline-stats"></div>` after `#bottom-timeline`, mount via `mountStatsBar(el, store)`
- CSS: flex, gap 16px, text 11px

## Technical Constraints
- Pure ES modules
- All existing tests pass

## Verification Commands
```bash
test -f runtime/web/src/timeline/stats-bar.js
grep -q 'mountStatsBar' runtime/web/src/timeline/stats-bar.js
grep -q 'mountStatsBar' runtime/web/index.html
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
