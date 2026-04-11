# Review Instructions — R8

## Review Steps
1. Run all verification commands.
2. Visual/structural audit:
   - 6 timeline modules exist (index/ruler/track/clip/playhead/zoom)
   - `mountTimeline` subscribes to store; re-renders on timeline changes
   - Playhead updates should not re-render clips (perf critical)
3. Zoom:
   - `pxPerSecond` reads from zoom state
   - Cmd+= / Cmd+- actually bound
   - Zoom range 0.1-50
4. Category colors match spec
5. No drag logic yet — reject if it's been added this round (scope creep)
6. Non-regression: R6 index.html structure intact

## Scoring
- 10/10: all 6 modules, clean re-render split, zoom wired, demo timeline renders correctly
- <10: gaps

Write `review.json`. complete=true only at score=10.
