# Task — R8: Multi-track timeline visual (ruler + clips + playhead)

## Goal
Replace R6's placeholder timeline with a data-driven multi-track timeline that reads from `store.state.timeline` and renders ruler, tracks, clips, and playhead. Scrolls horizontally/vertically, zoomable. No drag yet — just visuals.

## Requirements

### JS (`runtime/web/src/timeline/`)
- `timeline/index.js` — `export function mountTimeline(container, store)` attaches the timeline UI into a DOM container and re-renders on store changes
- `timeline/ruler.js` — draws the time ruler. Shows tick marks + labels (00:00, 00:05, etc.). Ticks adapt to zoom level (every 1s when zoomed in, every 5s mid, every 10s zoomed out)
- `timeline/track.js` — draws one track row: track header (name + mute/lock icons) + clip area with clip rectangles
- `timeline/clip.js` — draws one clip: background fill (scene category color), scene name label, in/out handles (visual only)
- `timeline/playhead.js` — draws the vertical playhead line spanning all tracks, follows `store.state.playhead` time
- `timeline/zoom.js` — converts between time ↔ pixels via `pxPerSecond`; exposes `setZoom(level)` where level ∈ [0.1, 50]
- Scroll: horizontal scroll via normal overflow-x on clip area, ruler + tracks scroll in sync via shared scroll container; vertical scroll for many tracks
- Store subscribes: when `timeline` changes, re-render affected tracks; when `playhead` changes, move playhead line only (no full re-render)

### Integration
- `runtime/web/index.html`'s `#bottom-timeline` now hosts `mountTimeline(el, store)` instead of static HTML
- Store seeded with a demo timeline (3 tracks, 6-8 clips total) for visual verification
- When demo timeline loads, clips render at correct positions per their start/dur

### Styling
- Track header: 120px wide, dark gray bg
- Clip: rounded 3px, 1px border matching category color, gradient fill, scene name truncated with ellipsis
- Playhead: 2px red line with triangle marker at top
- Category colors: Backgrounds=#3b82f6 (blue), Typography=#a855f7 (purple), Shapes=#06b6d4 (cyan), DataViz=#22c55e (green), Transitions=#f59e0b (amber), Overlays=#ec4899 (pink)

### Zoom controls
- Add zoom slider + zoom in/out buttons to the timeline header area
- Cmd+= / Cmd+- shortcuts bound
- Cmd+0 zooms to fit project duration

## Technical Constraints
- Pure ES modules, no libraries
- All DOM, no canvas for the timeline (crisp at DPR, easy to click later in R13)
- `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` still pass (no Rust changes)
- No regression of R6 layout IDs — `#bottom-timeline` still present; splitters still work

## Verification Commands
```bash
test -f runtime/web/src/timeline/index.js
test -f runtime/web/src/timeline/ruler.js
test -f runtime/web/src/timeline/track.js
test -f runtime/web/src/timeline/clip.js
test -f runtime/web/src/timeline/playhead.js
test -f runtime/web/src/timeline/zoom.js
grep -q 'mountTimeline' runtime/web/src/timeline/index.js
grep -q 'pxPerSecond' runtime/web/src/timeline/zoom.js
grep -q 'id="bottom-timeline"' runtime/web/index.html
grep -q 'mountTimeline' runtime/web/index.html
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
```

## Non-Goals
- NO drag editing
- NO blade/split
- NO snap
- NO playback (R20)
