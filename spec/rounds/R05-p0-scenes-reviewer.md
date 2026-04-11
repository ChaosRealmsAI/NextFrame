# Review Instructions — R5

You are a strict reviewer of the scene registry + demo wiring.

## Review Steps
1. Read the task. This round must leave the repo in a state where opening `runtime/web/demo.html` in a browser shows all 5 scenes cycling through their clip windows.
2. Run ALL verification commands.
3. Scene purity audit:
   - Open each file in `runtime/web/src/scenes/*.js`
   - Confirm: no `Math.random()`, no top-level `let`, no captured mutable closures, no `new Date()`
   - Confirm: function signature is `(t, params, ctx, globalT)` or `(t, params, ctx)`
4. Timeline audit:
   - `demo-timeline.json` — are all 5 scene ids actually registered in `SCENE_MANIFEST`?
   - Do clip start+dur fit in `duration: 30`? No clip can extend past `duration`.
5. demo.html audit:
   - Is it a single self-contained HTML file (no external CSS/JS URLs)?
   - Does the rAF loop correctly compute `t` and call engine's `renderAt`?
   - Is the canvas DPR-aware (uses setupDPR from engine)?
   - Read the full file to ensure it actually runs — no truncated script tags, no missing imports.
6. Manifest completeness:
   - `SCENE_MANIFEST[i]` must have: id, name, category, params (schema), duration_hint
   - Categories should match the 6 taxonomy from `spec/scene-library.md`

## Scoring
- 10/10: all 5 scenes register, demo-timeline valid, demo.html self-contained and correct, purity preserved, manifest complete
- <10: reject for any missing file, purity break, or demo.html that won't render

Write `review.json`. complete=true only when score=10.
