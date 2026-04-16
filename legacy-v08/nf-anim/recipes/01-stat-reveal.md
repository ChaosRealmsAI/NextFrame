# 01 Stat Reveal

## Schema Cheatsheet

Use this pattern for big number reveals, KPI callouts, and compact stat cards.

```json
{
  "duration": 2.4,
  "size": [320, 220],
  "layers": [
    {
      "shape": "text",
      "at": [160, 88],
      "text": "12.4K",
      "fontSize": 72,
      "fill": "#0f172a",
      "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.35, 1, "out"]], "scale": [[0, 0.84], [0.65, 1, "outBack"]] } }]
    },
    {
      "shape": "text",
      "at": [160, 138],
      "text": "Active users",
      "fontSize": 18,
      "fill": "#475569"
    }
  ]
}
```

Authoring rules:
- Put the headline value on its own `text` layer.
- Use one primary entrance motion only; stat cards get muddy when multiple layers compete.
- Add a secondary label or delta layer so the number has context.
- Prefer `countUp`, `fadeIn`, `popIn`, `scaleIn`, `slideInUp`, and `pulse`.
- Keep the visual hierarchy simple: one hero value, one support line, one optional accent.

Relevant scenes:
- `statHero`
- `statBig`
- `kpiGrid`
- `comparison`

Relevant behaviors:
- `countUp`
- `fadeIn`
- `popIn`
- `scaleIn`
- `slideInUp`
- `slideInRight`
- `pulse`
- `highlight`

Relevant shapes:
- `text`
- `bar`
- `ring`
- `circle`
- `rect`
- `plus`
- `arrow`

## Worked Example 1

Prompt:
`Show a big subscriber count growing up with a soft badge underneath.`

JSON:
```json
{
  "duration": 2.4,
  "size": [320, 220],
  "layers": [
    { "shape": "circle", "at": [160, 84], "radius": 58, "fill": "#fff7ed", "stroke": "#fdba74", "strokeWidth": 8, "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.3, 1, "out"]], "scale": [[0, 0.88], [0.8, 1, "outBack"]] } }] },
    { "shape": "text", "at": [160, 88], "text": "12.4K", "fontSize": 68, "fill": "#0f172a", "behaviors": [{ "tracks": { "number": [[0, 0], [1.6, 12400, "out"]], "opacity": [[0, 0.25], [0.25, 1, "out"]] } }] },
    { "shape": "rect", "at": [160, 148], "width": 124, "height": 34, "radius": 17, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.35, 0], [0.7, 1, "out"]], "offset": [[0.35, [0, 12]], [0.8, [0, 0], "out"]] } }] },
    { "shape": "text", "at": [160, 148], "text": "Subscribers", "fontSize": 16, "fill": "#fff7ed", "behaviors": [{ "tracks": { "opacity": [[0.4, 0], [0.75, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`01-stat-reveal-subscriber-badge.svg`

Why it works:
- The number owns the frame.
- The badge arrives after the count, so the reveal reads in sequence.
- The background circle gives scale without turning the layout into a full chart.

## Worked Example 2

Prompt:
`Reveal quarterly revenue with a percentage delta and a subtle confidence pulse.`

JSON:
```json
{
  "duration": 2.8,
  "size": [320, 220],
  "layers": [
    { "shape": "ring", "at": [160, 92], "radius": 60, "stroke": "#fdba74", "strokeWidth": 10, "fill": "none", "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.35, 1, "out"]], "scale": [[0, 0.76], [0.75, 1, "outBack"]] } }] },
    { "shape": "text", "at": [160, 86], "text": "$8.9M", "fontSize": 64, "fill": "#0f172a", "behaviors": [{ "tracks": { "number": [[0, 0], [1.8, 8.9, "out"]], "opacity": [[0, 0.2], [0.3, 1, "out"]] } }] },
    { "shape": "plus", "at": [112, 146], "fill": "#da7756", "behaviors": [{ "tracks": { "opacity": [[0.55, 0], [0.9, 1, "out"]], "scale": [[0.55, 0.7], [1.0, 1, "outBack"]] } }] },
    { "shape": "text", "at": [168, 146], "text": "+18% QoQ", "fontSize": 18, "fill": "#da7756", "behaviors": [{ "tracks": { "opacity": [[0.6, 0], [1.0, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 182], "text": "Quarterly revenue", "fontSize": 15, "fill": "#64748b", "behaviors": [{ "tracks": { "opacity": [[0.7, 0], [1.15, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`01-stat-reveal-revenue-delta.svg`

Notes:
- Keep the delta color warmer than the base copy.
- Use a ring or soft panel when the stat needs a premium, centered feel.
- Avoid adding bars unless the viewer needs a comparison baseline.

## Worked Example 3

Prompt:
`Make a compact KPI tile for resolved tickets with a tiny trend bar below the number.`

JSON:
```json
{
  "duration": 2.2,
  "size": [320, 220],
  "layers": [
    { "shape": "rect", "at": [160, 110], "width": 228, "height": 152, "radius": 28, "fill": "#fff7ed", "stroke": "#fed7aa", "strokeWidth": 4, "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.35, 1, "out"]], "scale": [[0, 0.94], [0.6, 1, "outBack"]] } }] },
    { "shape": "text", "at": [160, 82], "text": "642", "fontSize": 64, "fill": "#0f172a", "behaviors": [{ "tracks": { "number": [[0, 0], [1.4, 642, "out"]], "opacity": [[0.1, 0], [0.35, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 120], "text": "Resolved tickets", "fontSize": 18, "fill": "#475569", "behaviors": [{ "tracks": { "opacity": [[0.25, 0], [0.65, 1, "out"]] } }] },
    { "shape": "bar", "at": [120, 160], "width": 26, "height": 34, "radius": 10, "fill": "#fdba74", "behaviors": [{ "tracks": { "scaleY": [[0.4, 0.15], [1.0, 1, "out"]] } }] },
    { "shape": "bar", "at": [160, 160], "width": 26, "height": 56, "radius": 10, "fill": "#f97316", "behaviors": [{ "tracks": { "scaleY": [[0.5, 0.15], [1.1, 1, "out"]] } }] },
    { "shape": "bar", "at": [200, 160], "width": 26, "height": 76, "radius": 10, "fill": "#da7756", "behaviors": [{ "tracks": { "scaleY": [[0.6, 0.15], [1.2, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`01-stat-reveal-ticket-kpi.svg`

Checklist:
- Keep the trend bars clearly subordinate to the value.
- Use no more than three bars in a stat tile.
- If the stat is the message, center it.
- If the delta is the message, put the value and delta on one line.
