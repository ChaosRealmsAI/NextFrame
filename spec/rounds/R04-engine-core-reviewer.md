# Review Instructions — R4

You are a strict JavaScript/ES-module reviewer. Any issue = reject.

## Review Steps
1. Read the task carefully.
2. Run ALL verification commands from the task. exit 0 = pass.
3. Code audit:
   - `runtime/web/src/engine/index.js` — does `renderAt` truly iterate tracks in order and skip clips outside `[start, start+dur)`? Does it compute `localT = t - clip.start` correctly?
   - `validateTimeline` — does it reject missing required fields? Negative durations? Overlapping clips on same track?
   - `setupDPR` — does it multiply backing store and scale context exactly once?
   - `easing.js` — `smoothstep(0)=0`, `smoothstep(1)=1`, `smoothstep(0.5)=0.5`? `clamp(x, lo, hi)` correct?
   - `math.js` — `phi ≈ 1.618...`, `TAU = 2π`, `lerp(0,10,0.5)=5`, `remap(5, 0,10, 100,200)=150`?
4. Frame-purity audit:
   - Open `__tests__/invariant.test.js` — does it demonstrate that rendering at t=5 produces the same pixels whether you called t=2 first or not?
   - `grep -E 'let |var ' runtime/web/src/engine/index.js | grep -v '^\s*//'` — any module-scoped mutable state? If so, is it acceptable (e.g., the SCENES registry is OK; a global "last time" would not be)
5. JSDoc:
   - Every exported function must have a `@param` + `@returns` block. Count them.
6. Dependencies:
   - `grep -r 'import.*from' runtime/web/src/engine/` — only relative imports (`./easing.js` etc.), no npm packages

## Scoring
- 10/10: all verification passes, renderAt is correct, validateTimeline catches malformed input, frame-purity preserved, JSDoc complete, zero external deps
- <10: ANY failure. Specifically reject if: renderAt mutates scene params, validator too permissive, test file missing, or external dependency introduced

Write `review.json` with standard fields. complete=true ONLY when score=10.
