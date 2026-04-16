# 02 Data Chart

## Schema Cheatsheet

Use this recipe for bar, line, pie, and side-by-side comparison views.

```json
{
  "duration": 3.0,
  "size": [320, 220],
  "layers": [
    { "shape": "bar", "at": [92, 118], "width": 30, "height": 72, "radius": 10, "fill": "#fdba74", "behaviors": [{ "tracks": { "scaleY": [[0, 0.12], [0.9, 1, "out"]] } }] },
    { "shape": "bar", "at": [140, 104], "width": 30, "height": 100, "radius": 10, "fill": "#f97316", "behaviors": [{ "tracks": { "scaleY": [[0.1, 0.12], [1.0, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 188], "text": "Quarterly growth", "fontSize": 16, "fill": "#475569" }
  ]
}
```

Chart rules:
- Pick one chart family per scene.
- Use stagger for bar series, draw for line series, fill for pie series.
- Keep labels short; the chart geometry should carry most of the explanation.
- When comparison matters, align baselines and keep bar widths consistent.
- Reserve accent color for the series you want the viewer to notice first.

Relevant scenes:
- `barChart`
- `lineChart`
- `pieChart`
- `comparison`
- `progressRing`
- `dataMap`

Relevant behaviors:
- `barGrow`
- `lineDraw`
- `pieFill`
- `chartReveal`
- `countUp`
- `highlight`
- `fadeIn`
- `slideInUp`

Relevant shapes:
- `bar`
- `line`
- `pie`
- `area`
- `text`
- `dot`
- `ring`

## Worked Example 1

Prompt:
`Animate a simple three-bar chart comparing free, pro, and enterprise signups.`

JSON:
```json
{
  "duration": 2.6,
  "size": [320, 220],
  "layers": [
    { "shape": "bar", "at": [96, 118], "width": 32, "height": 70, "radius": 12, "fill": "#fdba74", "behaviors": [{ "tracks": { "scaleY": [[0, 0.15], [0.85, 1, "out"]], "opacity": [[0, 0.3], [0.25, 1, "out"]] } }] },
    { "shape": "bar", "at": [160, 104], "width": 32, "height": 98, "radius": 12, "fill": "#f97316", "behaviors": [{ "tracks": { "scaleY": [[0.12, 0.15], [0.97, 1, "out"]], "opacity": [[0.12, 0.3], [0.37, 1, "out"]] } }] },
    { "shape": "bar", "at": [224, 90], "width": 32, "height": 126, "radius": 12, "fill": "#da7756", "behaviors": [{ "tracks": { "scaleY": [[0.24, 0.15], [1.09, 1, "out"]], "opacity": [[0.24, 0.3], [0.49, 1, "out"]] } }] },
    { "shape": "text", "at": [96, 168], "text": "Free", "fontSize": 14, "fill": "#64748b" },
    { "shape": "text", "at": [160, 168], "text": "Pro", "fontSize": 14, "fill": "#64748b" },
    { "shape": "text", "at": [224, 168], "text": "Ent", "fontSize": 14, "fill": "#64748b" },
    { "shape": "text", "at": [160, 192], "text": "Signup mix", "fontSize": 16, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.45, 0], [0.9, 1, "out"]] } }] }
  ]
}
```

Rendered preview filename:
`02-data-chart-signup-bars.svg`

## Worked Example 2

Prompt:
`Show a line chart of weekly retention with a caption that fades in after the path draws.`

JSON:
```json
{
  "duration": 2.9,
  "size": [320, 220],
  "layers": [
    { "shape": "line", "at": [160, 102], "points": [[-108, 42], [-62, 18], [-14, 8], [34, -12], [96, -34]], "stroke": "#da7756", "strokeWidth": 10, "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.25, 1, "out"]], "draw": [[0, 0], [1.45, 1, "out"]] } }] },
    { "shape": "circle", "at": [256, 68], "radius": 9, "fill": "#f97316", "behaviors": [{ "tracks": { "scale": [[1.1, 0.4], [1.55, 1, "outBack"]], "opacity": [[1.1, 0], [1.4, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 178], "text": "Retention after onboarding changes", "fontSize": 15, "fill": "#475569", "behaviors": [{ "tracks": { "opacity": [[1.0, 0], [1.45, 1, "out"]], "offset": [[1.0, [0, 10]], [1.45, [0, 0], "out"]] } }] }
  ]
}
```

Rendered preview filename:
`02-data-chart-retention-line.svg`

Guidance:
- Put one focus marker on the last or most important point.
- Let the caption arrive after the line draw completes.
- Do not add every axis label in a compact social-video frame.

## Worked Example 3

Prompt:
`Create a pie chart for device split with one highlighted slice and a center label.`

JSON:
```json
{
  "duration": 2.7,
  "size": [320, 220],
  "layers": [
    { "shape": "pie", "at": [160, 102], "value": 64, "radius": 62, "fill": "#da7756", "behaviors": [{ "tracks": { "opacity": [[0, 0], [0.2, 1, "out"]], "scale": [[0, 0.86], [0.9, 1, "outBack"]] } }] },
    { "shape": "pie", "at": [160, 102], "value": 36, "radius": 44, "fill": "#fdba74", "behaviors": [{ "tracks": { "opacity": [[0.18, 0], [0.38, 1, "out"]], "scale": [[0.18, 0.86], [1.0, 1, "outBack"]] } }] },
    { "shape": "circle", "at": [160, 102], "radius": 24, "fill": "#fff7ed" },
    { "shape": "text", "at": [160, 98], "text": "64%", "fontSize": 28, "fill": "#0f172a", "behaviors": [{ "tracks": { "opacity": [[0.45, 0], [0.85, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 124], "text": "Mobile", "fontSize": 14, "fill": "#64748b", "behaviors": [{ "tracks": { "opacity": [[0.55, 0], [0.95, 1, "out"]] } }] },
    { "shape": "text", "at": [160, 188], "text": "Device split", "fontSize": 15, "fill": "#475569" }
  ]
}
```

Rendered preview filename:
`02-data-chart-device-pie.svg`

Checklist:
- Bars grow from a baseline.
- Lines draw left to right.
- Pie charts should never have many tiny wedges in this format.
- Keep the chart title outside the main plot area.
