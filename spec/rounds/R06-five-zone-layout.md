# Task — R6: 5-zone editor layout HTML/CSS (no logic yet)

## Goal
Replace `runtime/web/index.html` with a CapCut-style 5-zone editor shell: top menu, left asset library, center preview, right inspector, bottom timeline. Pure structural HTML + CSS — no JavaScript behavior yet. Looks production-quality, dark theme, resizable splitters.

## Requirements
- `runtime/web/index.html` contains the shell. Single file; inline `<style>` and inline structural `<script>` only (splitter drag handlers OK as plain DOM events, but no logic modules).
- 5 zones with these IDs:
  - `#top-menu` (32px fixed height, border-bottom)
  - `#left-library` (240px default, min 180, max 400) — list of placeholder asset cards (8-12 fake thumbnails)
  - `#center-preview` (flex, min 480px) — black video area with 16:9 aspect ratio maintained, centered, with "transport" row below (play/pause placeholder button, time display `00:00 / 00:30`)
  - `#right-inspector` (280px default, min 220, max 420) — "Select a clip" empty state
  - `#bottom-timeline` (240px default, min 180, max 480) — ruler header (fake 0-30s ticks), 3 track lanes (V1, V2, A1) with 2-3 fake clip rectangles
- Two draggable splitters: one between library/preview/inspector (horizontal top row), one between top row and timeline (vertical)
- Splitter drag changes flex-basis of adjacent zones; minimum/maximum widths enforced
- Dark theme: background `#0b0b14`, panel surface `#14141e`, border `#22222e`, text `#e6e6f0`, accent `#6366f1` (indigo)
- Typography: system font stack, no external fonts
- Visual quality bar: should look like a real DAW/NLE, not a hand-drawn mock. Rounded corners, subtle borders, proper spacing (8/16/24 rhythm)
- 1440x900 is the target canvas — layout should be perfect at that size
- **Tests must not regress R2's WebView bootstrap**: `cargo run -p shell` still opens and shows this new HTML

## Technical Constraints
- Zero external resources (no CDN, no fonts, no images)
- All content procedurally generated in HTML — fake asset thumbnails can be CSS gradients
- No frameworks, no build step
- `cargo fmt --check` + `cargo clippy --workspace --all-targets -- -D warnings` still pass (no Rust changes)
- File is well-formed HTML5

## Code Structure
Only `runtime/web/index.html` changes. Do NOT touch:
- `runtime/web/demo.html` (R5)
- `runtime/web/src/` (R4, R5)
- Any Rust crate

## Verification Commands
```bash
test -f runtime/web/index.html
grep -q 'id="top-menu"' runtime/web/index.html
grep -q 'id="left-library"' runtime/web/index.html
grep -q 'id="center-preview"' runtime/web/index.html
grep -q 'id="right-inspector"' runtime/web/index.html
grep -q 'id="bottom-timeline"' runtime/web/index.html
grep -q 'splitter' runtime/web/index.html
grep -q '#0b0b14' runtime/web/index.html
grep -qE 'V1|Video 1' runtime/web/index.html
python3 -c "import html.parser,sys; p=html.parser.HTMLParser(); p.feed(open('runtime/web/index.html').read()); print('html ok')"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build -p shell
```

## Non-Goals
- NO JS logic modules (bridge.js etc. are for R3/R7 rounds)
- NO real data — all placeholders
- NO splitter state persistence
- NO responsive layout for sizes < 1200
