# 04 Feedback FX

## Schema Cheatsheet

Use this recipe for like, check, error, warning, and success states.

```json
{
  "duration": 1.8,
  "size": [320, 220],
  "layers": [
    { "type": "ripple", "at": [160, 96], "count": 3, "stroke": "#fdba74", "fill": "none", "duration": 0.8 },
    { "shape": "check", "at": [160, 96], "fill": "#da7756", "behaviors": [{ "tracks": { "scale": [[0, 0.55], [0.65, 1, "outBack"]], "opacity": [[0, 0], [0.2, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 154], "text": "Saved", "fontSize": 18, "fill": "#0f172a" }
  ]
}
```

Feedback rules:
- Keep the icon large and readable.
- Pair the icon with one supporting label only if the state is ambiguous.
- Success motions should open and settle.
- Error motions should hit fast, wobble, then stop.
- Likes and reactions should use bursts or ripples, not long transitions.

Relevant scenes:
- `heartLike`
- `animatedCheck`
- `errorShake`
- `successConfetti`
- `loadingPulse`

Relevant behaviors:
- `popIn`
- `pulse`
- `shake`
- `bounce`
- `flash`
- `ripple`
- `burst`
- `fadeIn`

Relevant shapes:
- `heart`
- `check`
- `cross`
- `bell`
- `star`
- `sparkle`
- `circle`
- `text`

## Worked Example 1

Prompt:
`Make a like reaction with a heart pop and a ring burst around it.`

JSON:
```json
{
  "duration": 1.9,
  "size": [320, 220],
  "layers": [
    { "type": "burst", "at": [160, 96], "count": 8, "distance": 44, "radius": 5, "fill": "#fdba74", "duration": 0.6 },
    { "type": "ripple", "at": [160, 96], "count": 2, "stroke": "#f97316", "fill": "none", "duration": 0.7, "perRingDelay": 0.12 },
    { "shape": "heart", "at": [160, 96], "fill": "#da7756", "behaviors": [{ "tracks": { "scale": [[0, 0.4], [0.55, 1.06, "outBack"], [0.95, 1, "out"]], "opacity": [[0, 0], [0.18, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 154], "text": "Liked", "fontSize": 18, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.28, 0], [0.62, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`04-feedback-fx-heart-like.svg`

## Worked Example 2

Prompt:
`Show a successful save with a check mark and soft confirmation pulse.`

JSON:
```json
{
  "duration": 1.8,
  "size": [320, 220],
  "layers": [
    { "shape": "circle", "at": [160, 94], "radius": 52, "fill": "#fff7ed", "stroke": "#fdba74", "strokeWidth": 8, "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.18, 1, "out"]], "scale": [[0, 0.82], [0.55, 1, "outBack"]] } }] },
    { "shape": "check", "at": [160, 94], "fill": "#da7756", "behaviors": [{ "tracks": { "scale": [[0.1, 0.45], [0.62, 1, "outBack"]], "opacity": [[0.1, 0], [0.3, 1, "out"]] } }] },
    { "type": "ripple", "at": [160, 94], "count": 2, "stroke": "#fdba74", "fill": "none", "duration": 0.65, "startAt": 0.35 },
    { "shape": "text", "at": [160, 154], "text": "Saved", "fontSize": 18, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.35, 0], [0.68, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`04-feedback-fx-animated-check.svg`

## Worked Example 3

Prompt:
`Animate an error state with a red cross and a quick side-to-side shake.`

JSON:
```json
{
  "duration": 1.6,
  "size": [320, 220],
  "layers": [
    { "shape": "circle", "at": [160, 94], "radius": 52, "fill": "#fff1f2", "stroke": "#fecdd3", "strokeWidth": 8, "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.15, 1, "out"]], "scale": [[0, 0.88], [0.45, 1, "outBack"]] } }] },
    { "shape": "cross", "at": [160, 94], "fill": "#dc2626", "behaviors": [{ "tracks": { "opacity": [[0.08, 0], [0.22, 1, "out"]], "offset": [[0.22, [0, 0]], [0.33, [-10, 0], "out"], [0.44, [10, 0], "out"], [0.56, [-8, 0], "out"], [0.68, [0, 0], "out"]] } }] },
    { "shape": "text", "at": [160, 154], "text": "Try again", "fontSize": 18, "fill": "#991b1b", "behaviors": [{ "tracks": { "opacity": [[0.24, 0], [0.56, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`04-feedback-fx-error-shake.svg`

Checklist:
- Reactions can be playful.
- Errors should resolve quickly and stop moving.
- Success states should end on a stable, readable icon.
- Keep the copy under two words when possible.
