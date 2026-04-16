# 05 Transition

## Schema Cheatsheet

Use this recipe for wipes, pushes, dissolves, and chapter handoffs between scenes.

```json
{
  "duration": 1.4,
  "size": [320, 220],
  "layers": [
    { "shape": "rect", "at": [160, 110], "width": 240, "height": 132, "radius": 28, "fill": "#da7756", "behaviors": [{ "tracks": { "scaleX": [[0, 0.1], [0.8, 1, "out"]], "opacity": [[0, 0], [0.2, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 110], "text": "Next Scene", "fontSize": 26, "fill": "#fff7ed", "behaviors": [{ "tracks": { "opacity": [[0.28, 0], [0.75, 1, "out"]] } }] }
  ]
}
```

Transition rules:
- One directional idea per transition.
- Short durations read better than ornamental transitions.
- Use wipes and pushes for momentum, dissolves for tone shifts, iris for focus changes.
- Keep text optional; many transitions work better as pure geometry.
- Match the transition axis to the narrative flow when possible.

Relevant scenes:
- `wipeNext`
- `dissolveCard`
- `irisOpen`
- `pushReveal`
- `sectionDivider`

Relevant behaviors:
- `wipeReveal`
- `fadeOut`
- `fadeIn`
- `slideInRight`
- `slideOut`
- `scaleIn`
- `scaleOut`
- `blurOut`

Relevant shapes:
- `rect`
- `circle`
- `ring`
- `capsule`
- `text`

## Worked Example 1

Prompt:
`Create a warm wipe transition that reveals the next chapter title from left to right.`

JSON:
```json
{
  "duration": 1.5,
  "size": [320, 220],
  "layers": [
    { "shape": "rect", "at": [160, 110], "width": 252, "height": 138, "radius": 34, "fill": "#da7756", "behaviors": [{ "tracks": { "scaleX": [[0, 0.08], [0.78, 1, "out"]], "opacity": [[0, 0], [0.16, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 102], "text": "Chapter 04", "fontSize": 14, "fill": "#fff7ed", "behaviors": [{ "tracks": { "opacity": [[0.3, 0], [0.58, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 128], "text": "Distribution", "fontSize": 28, "fill": "#fff7ed", "behaviors": [{ "tracks": { "opacity": [[0.36, 0], [0.72, 1, "out"]], "offset": [[0.36, [-16, 0]], [0.72, [0, 0], "out"]] } }] }
  ]
}
```

Rendered preview filename:
`05-transition-wipe-chapter.svg`

## Worked Example 2

Prompt:
`Dissolve a product card out and bring the new card in with a soft scale settle.`

JSON:
```json
{
  "duration": 1.7,
  "size": [320, 220],
  "layers": [
    { "shape": "rect", "at": [160, 110], "width": 194, "height": 120, "radius": 28, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0, 1], [0.55, 0, "out"]], "scale": [[0, 1], [0.55, 0.92, "out"]] } }] },
    { "shape": "rect", "at": [160, 110], "width": 194, "height": 120, "radius": 28, "fill": "#fff7ed", "stroke": "#fdba74", "strokeWidth": 4, "behaviors": [{ "tracks": { "opacity": [[0.45, 0], [0.95, 1, "out"]], "scale": [[0.45, 1.08], [1.05, 1, "outBack"]] } }] },
    { "shape": "text", "at": [160, 108], "text": "New card", "fontSize": 28, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.58, 0], [1.02, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`05-transition-dissolve-card.svg`

## Worked Example 3

Prompt:
`Open an iris transition onto a focus statement in the center of the frame.`

JSON:
```json
{
  "duration": 1.6,
  "size": [320, 220],
  "layers": [
    { "shape": "circle", "at": [160, 108], "radius": 78, "fill": "#da7756", "behaviors": [{ "tracks": { "scale": [[0, 0.1], [0.72, 1, "outBack"]], "opacity": [[0, 0], [0.12, 1, "out"]] } }] },
    { "shape": "circle", "at": [160, 108], "radius": 38, "fill": "#fff7ed", "behaviors": [{ "tracks": { "scale": [[0.15, 0.1], [0.84, 1, "outBack"]], "opacity": [[0.15, 0], [0.3, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 108], "text": "Focus", "fontSize": 26, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.4, 0], [0.82, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`05-transition-iris-focus.svg`

Checklist:
- Wipes imply direction.
- Dissolves imply replacement.
- Iris transitions imply focus or zoom.
- Keep transition copy short or omit it entirely.
