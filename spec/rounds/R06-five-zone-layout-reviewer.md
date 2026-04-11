# Review Instructions — R6

You are a strict UI reviewer for a CapCut-style editor shell. Any gap = reject.

## Review Steps
1. Read the task.
2. Run all verification commands.
3. Visual audit (read the HTML carefully):
   - All 5 zone IDs present and correctly nested
   - Dark palette consistent (background `#0b0b14`, surface `#14141e`, border `#22222e`, text `#e6e6f0`, accent `#6366f1`)
   - Two splitters implemented with `mousedown`+`mousemove`+`mouseup` pattern
   - Min/max constraints enforced on splitter drag
   - 8-12 placeholder asset cards in left library (procedural gradients OK)
   - Preview area is 16:9 aspect-ratio locked with black inner canvas
   - Timeline has 3 lanes + ruler + at least 2-3 clip rectangles per lane positioned with `left` + `width`
4. Quality audit:
   - Proper spacing (no cramped or wasted space)
   - Rounded corners on panels (4-8px)
   - Borders are subtle (1px, low contrast)
   - Typography hierarchy visible: panel headers vs body text
5. Structure audit:
   - Single-file HTML5, no external URLs, no `<link>` to external fonts/CSS
   - `<script>` is only for splitter logic, <50 lines
6. Non-regression:
   - R2 wry shell still builds (`cargo build -p shell` exits 0)
   - No Rust file touched (`git diff --stat HEAD~1 -- '*.rs'` should be empty)

## Scoring
- 10/10: all zones, correct colors, working splitters, proper spacing, zero external deps, build clean
- <10: ANY missing zone, wrong color, missing splitter, or external dep

Write `review.json`. complete=true only when score=10.
