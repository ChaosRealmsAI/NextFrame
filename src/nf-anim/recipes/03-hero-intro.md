# 03 Hero Intro

## Schema Cheatsheet

Use this recipe for brand reveals, product launch moments, and section dividers.

```json
{
  "duration": 2.6,
  "size": [320, 220],
  "layers": [
    { "shape": "ring", "at": [160, 88], "radius": 58, "stroke": "#fdba74", "strokeWidth": 10, "fill": "none", "behaviors": [{ "tracks": { "scale": [[0, 0.8], [0.9, 1, "outBack"]], "opacity": [[0, 0], [0.35, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 92], "text": "Launch Day", "fontSize": 34, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.1, 0], [0.55, 1, "out"]], "offset": [[0.1, [0, 18]], [0.55, [0, 0], "out"]] } }] }
  ]
}
```

Hero rules:
- Introduce one message, not a paragraph.
- Use one dominant visual anchor: a ring, plate, wordmark, or icon.
- Stage the entrance in a clear order: background shape, hero line, support line.
- Avoid small labels everywhere; intros should feel decisive.
- If the scene is a divider, favor geometry and short text over literal UI metaphors.

Relevant scenes:
- `brandReveal`
- `productLaunch`
- `sectionDivider`
- `quoteLarge`
- `featureRow`

Relevant behaviors:
- `fadeIn`
- `slideInUp`
- `slideInRight`
- `scaleIn`
- `springIn`
- `wipeReveal`
- `glow`
- `sparkle`

Relevant shapes:
- `text`
- `ring`
- `rect`
- `circle`
- `sparkle`
- `star`
- `bolt`
- `capsule`

## Worked Example 1

Prompt:
`Reveal a brand name with a warm halo and a short “new season” kicker below it.`

JSON:
```json
{
  "duration": 2.5,
  "size": [320, 220],
  "layers": [
    { "shape": "circle", "at": [160, 84], "radius": 70, "fill": "#fff7ed", "stroke": "#fed7aa", "strokeWidth": 6, "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.28, 1, "out"]], "scale": [[0, 0.82], [0.9, 1, "outBack"]] } }] },
    { "shape": "text", "at": [160, 90], "text": "Northline", "fontSize": 36, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.15, 0], [0.65, 1, "out"]], "offset": [[0.15, [0, 20]], [0.65, [0, 0], "out"]] } }] },
    { "shape": "capsule", "at": [160, 146], "width": 110, "height": 30, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.45, 0], [0.8, 1, "out"]], "scaleX": [[0.45, 0.72], [0.9, 1, "outBack"]] } }] },
    { "shape": "text", "at": [160, 146], "text": "New season", "fontSize": 14, "fill": "#fff7ed", "behaviors": [{ "tracks": { "opacity": [[0.5, 0], [0.86, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`03-hero-intro-brand-halo.svg`

## Worked Example 2

Prompt:
`Create a product launch card that slides in and lands with a small sparkle burst.`

JSON:
```json
{
  "duration": 2.9,
  "size": [320, 220],
  "layers": [
    { "shape": "rect", "at": [160, 102], "width": 196, "height": 118, "radius": 26, "fill": "#fff7ed", "stroke": "#fdba74", "strokeWidth": 4, "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.28, 1, "out"]], "offset": [[0, [36, 0]], [0.8, [0, 0], "out"]], "rotate": [[0, 6], [0.8, 0, "out"]] } }] },
    { "type": "burst", "at": [232, 58], "count": 7, "distance": 34, "radius": 5, "fill": "#f97316", "duration": 0.7, "startAt": 0.75 },
    { "shape": "text", "at": [160, 86], "text": "Arc One", "fontSize": 34, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.22, 0], [0.7, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 118], "text": "Portable mixer", "fontSize": 16, "fill": "#475569", "behaviors": [{ "tracks": { "opacity": [[0.32, 0], [0.82, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 154], "text": "Now shipping", "fontSize": 15, "fill": "#da7756", "behaviors": [{ "tracks": { "opacity": [[0.55, 0], [0.98, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`03-hero-intro-product-launch.svg`

## Worked Example 3

Prompt:
`Make a bold section divider that wipes in from the left and names the next chapter.`

JSON:
```json
{
  "duration": 2.1,
  "size": [320, 220],
  "layers": [
    { "shape": "rect", "at": [160, 110], "width": 240, "height": 124, "radius": 32, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.2, 1, "out"]], "scaleX": [[0, 0.1], [0.75, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 96], "text": "Chapter 03", "fontSize": 14, "fill": "#fdba74", "behaviors": [{ "tracks": { "opacity": [[0.25, 0], [0.58, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 126], "text": "Go To Market", "fontSize": 30, "fill": "#fff7ed", "behaviors": [{ "tracks": { "opacity": [[0.28, 0], [0.72, 1, "out"]], "offset": [[0.28, [-18, 0]], [0.72, [0, 0], "out"]] } }] }
  ]
}
```

Rendered preview filename:
`03-hero-intro-section-divider.svg`

Checklist:
- One headline only.
- Support copy should be shorter than the hero line.
- Add sparkle only when the scene announces something, not when it explains something.
- Prefer left-to-right motion for chapter and reveal metaphors.
