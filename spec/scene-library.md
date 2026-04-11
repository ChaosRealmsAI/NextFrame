---
title: NextFrame v1 Scene Library
summary: The default scene set that ships with NextFrame v1. 6 categories, 28 scenes, all frame-pure, all AI-parameterizable, all rendered with pure Canvas 2D + procedural math. Targets CapCut-caliber aesthetics with editorial / motion-design polish.
---

# NextFrame v1 Scene Library

## Mission

Ship a **high-aesthetic, AI-operable scene library** as v1's default set. Every scene is:

1. **Frame-pure** — `scene(t, params, ctx, globalT) => void` with zero accumulated state. Scrubbing to `t = 3.7` always produces the same pixels.
2. **Procedural** — everything rendered from math. No external fonts, no images, no libraries. A fresh install has a complete palette on day 1.
3. **AI-parameterizable** — every param is typed, ranged, and named so an LLM can pick values from a natural-language prompt.
4. **Editorial-grade** — gradients, proper easing, typography hierarchy, subtle grain/glow. The reference is CapCut templates, Apple keynote openers, Motion Canvas, Linear/Vercel/Stripe's marketing surfaces. Not generic canvas demos.

---

## Design principles (apply to every scene)

- **Unified palette via HSL rotation.** Most scenes accept `hueStart` / `hueEnd` instead of hard-coded colors. AI picks one number, we rotate the whole look.
- **Fade-in on `t < 0.3s` via smoothstep.** Every scene enters softly. No hard cuts from the scene itself — cuts are the timeline's job.
- **Easing library is inline.** Each file defines `smoothstep`, `easeOutCubic`, `easeInCubic` locally. No imports, no shared module. Keeps scenes portable to any runtime.
- **Procedural grain / glow for depth.** Flat canvas renders look cheap; every scene adds at least one of: grain, glow (shadowBlur), or gradient stops that aren't 50/50.
- **DPR-awareness via `ctx.canvas.width/height`.** Never hardcode 1920x1080. The scene reads actual canvas size and lays out proportionally.
- **Deterministic randomness.** Any noise uses a seeded `hash(i, salt)`, never `Math.random()`. This is the line between frame-pure and broken.
- **No closures over mutable state.** Top-level `let`/`var` in a scene file = rejection from the library.

---

## Taxonomy — 6 categories

Why these 6? They map to the actual job-to-be-done when assembling a video, not to implementation concerns:

| Category | What it does | When AI picks it |
|----------|--------------|------------------|
| **1. Backgrounds** | Full-frame ambient visuals that other layers sit on | "Give me a vibe" — user doesn't want a solid color |
| **2. Typography** | Text as the primary visual element | Title cards, quote cards, section breaks |
| **3. Shapes & Layout** | Procedural geometry, grids, compositions | Intro/outro stingers, section dividers, retro vibes |
| **4. Data Viz** | Data-driven charts with reveal animation | Explainers, pitch decks, "the numbers" moments |
| **5. Transitions** | Scene-to-scene bridges (0.3–1.0s) | Between any two clips, not content in themselves |
| **6. Overlays** | Information layers that sit on top of base content | Subtitles, lower thirds, HUDs, badges |

Content scenes (`video`, `image`) are explicitly **not in this library** — those are handled by the runtime's built-in media primitives. The scene library ships the *procedural* half of the system.

---

## 1. Backgrounds (5 scenes)

Full-frame ambient visuals. Usually go on track 1 with the lowest zIndex.

### auroraGradient
- **name**: `auroraGradient`
- **category**: Backgrounds
- **description**: A slow-breathing aurora field made of 4 overlapping radial blobs that drift on sine curves, fused with `screen` blending over a dark base. Optional procedural grain.
- **params**:
  - `hueA` — number, default `270`, range `[0, 360]`, "first aurora hue (violet)"
  - `hueB` — number, default `200`, range `[0, 360]`, "second aurora hue (cyan)"
  - `hueC` — number, default `320`, range `[0, 360]`, "third aurora hue (magenta)"
  - `intensity` — number, default `1.0`, range `[0, 1.5]`, "overall aurora brightness"
  - `grain` — number, default `0.04`, range `[0, 0.15]`, "film grain opacity"
- **duration_hint**: `10–30s`
- **aesthetic notes**: Colors rotate around a triad. Screen blending is non-negotiable — makes it feel like real light, not painted pixels. Grain prevents the "flat 2010 CSS gradient" look. Reference: Apple keynote backgrounds.
- **ai_prompt_example**: "A slow aurora background, violet to cyan, cinematic mood"

### gradientMesh
- **name**: `gradientMesh`
- **category**: Backgrounds
- **description**: A soft 4-point gradient mesh (stripe-inspired) where each corner color drifts along an HSL orbit. Canvas 2D approximation of a real mesh via layered radial gradients.
- **params**:
  - `cornerHues` — `number[4]`, default `[220, 280, 320, 40]`, "4 corner hues"
  - `driftSpeed` — number, default `0.15`, range `[0, 1]`, "how fast hues rotate"
  - `saturation` — number, default `80`, range `[40, 100]`
- **duration_hint**: `5–20s`
- **aesthetic notes**: Reference: Stripe.com homepage. Do NOT let saturation drop below 60 or it looks like PowerPoint.
- **ai_prompt_example**: "Stripe-style warm gradient background, slow drift"

### starField
- **name**: `starField`
- **category**: Backgrounds
- **description**: Procedural parallax star field — 3 layers of points at different depths, the closest layer scrolls, the farthest twinkles. Seeded so every call at the same `t` yields identical stars.
- **params**:
  - `starCount` — integer, default `200`, range `[50, 600]`
  - `layers` — integer, default `3`, range `[1, 5]`
  - `scrollSpeed` — number, default `0.02`, range `[0, 0.2]`
  - `tint` — string, default `"#ffffff"`, "star color"
- **duration_hint**: `10–60s`
- **aesthetic notes**: Twinkle via `0.5 + 0.5 * sin(t*2 + i)` per star. Stars must not all twinkle in sync.
- **ai_prompt_example**: "Deep space background, slow parallax stars"

### flowField
- **name**: `flowField`
- **category**: Backgrounds
- **description**: Perlin-like flow field visualized as short drifting ribbons, each particle's position a pure function of `(i, t)` seeded by a hash. Psychedelic but controlled.
- **params**:
  - `particleCount` — integer, default `800`, range `[100, 3000]`
  - `hue` — number, default `280`, range `[0, 360]`
  - `turbulence` — number, default `0.5`, range `[0, 2]`
- **duration_hint**: `6–20s`
- **aesthetic notes**: Use HSL not HSV. Trails faked via `fillRect` with low alpha on each frame but that's allowed here because each frame's trail is itself pure w.r.t. `t` (sample the path backward).
- **ai_prompt_example**: "Organic flowing particles, purple, dreamy"

### voidPulse
- **name**: `voidPulse`
- **category**: Backgrounds
- **description**: A single radial gradient that breathes — hue, radius, and center drift. Minimal, mood-setting, works as a backdrop for overlaid text.
- **params**:
  - `hue` — number, default `210`, range `[0, 360]`
  - `pulseRate` — number, default `0.2`, range `[0.05, 1]`, "breaths per second"
  - `centerX` — number, default `0.5`, range `[0, 1]`
  - `centerY` — number, default `0.5`, range `[0, 1]`
- **duration_hint**: `8–30s`
- **aesthetic notes**: Deep black edges, bright center. Don't let center alpha exceed 0.6 or it burns out.
- **ai_prompt_example**: "Minimal dark background with a slow blue pulse"

---

## 2. Typography (5 scenes)

Scenes where text IS the content.

### kineticHeadline
- **name**: `kineticHeadline`
- **category**: Typography
- **description**: Big editorial headline that reveals word-by-word with a masked slide-up, per-word HSL gradient fill, glow, and corner crosshairs. Subtitle fades in last. Linear/Vercel blog caliber.
- **params**:
  - `text` — string, default `"DESIGN IN MOTION"`, "headline text"
  - `subtitle` — string, default `"NextFrame"`, "small caption below"
  - `hueStart` — number, default `30`, range `[0, 360]`, "first word hue"
  - `hueEnd` — number, default `320`, range `[0, 360]`, "last word hue"
  - `stagger` — number, default `0.18`, range `[0.05, 0.5]`, "seconds between words"
  - `size` — number, default `0.12`, range `[0.05, 0.25]`, "font size relative to canvas height"
- **duration_hint**: `3–6s`
- **aesthetic notes**: System `-apple-system` / `SF Pro Display` for weight 900. Each word clipped to a bottom-anchored growing rect = the "text slides out of a slot" feel. Corner crosshairs sell the editorial frame.
- **ai_prompt_example**: "做一个标题动画：DESIGN IN MOTION，金色到粉色"

### typewriterCode
- **name**: `typewriterCode`
- **category**: Typography
- **description**: Monospace code block with character-by-character typing, a blinking cursor, and minimal syntax highlighting (keywords/strings/comments) via regex tokens.
- **params**:
  - `code` — string, multi-line, "code content"
  - `lang` — enum `['js','rust','python','ts']`, default `'js'`
  - `typeSpeed` — number, default `40`, range `[10, 120]`, "chars per second"
  - `theme` — enum `['velvet','mono','synth']`, default `'velvet'`
  - `fontSize` — number, default `0.028`, range `[0.012, 0.05]`
- **duration_hint**: `5–20s`
- **aesthetic notes**: Cursor blink is a pure function of `t` (`Math.floor(t * 2) % 2`). Token colors come from a small hardcoded palette per theme.
- **ai_prompt_example**: "Type out this Rust function: `fn render(t: f32) { ... }`"

### wordCycle
- **name**: `wordCycle`
- **category**: Typography
- **description**: One big centered word that morphs into the next via a crossfade + subtle y-shift. Great for "intro X / intro Y / intro Z" montages.
- **params**:
  - `words` — `string[]`, default `['FAST','SIMPLE','YOURS']`
  - `holdTime` — number, default `0.8`, range `[0.3, 2]`, "seconds per word"
  - `crossfade` — number, default `0.25`, range `[0.1, 0.6]`
  - `hue` — number, default `30`, range `[0, 360]`
- **duration_hint**: `words.length * holdTime`
- **aesthetic notes**: Each word has its own entry hue rotated by 30°. Use `shadowBlur` for a halo on the current word.
- **ai_prompt_example**: "轮播三个词：快、准、狠"

### quoteCard
- **name**: `quoteCard`
- **category**: Typography
- **description**: A pull-quote with big opening smart quote, italic serif-weight body, and author attribution that reveals 0.4s after the quote finishes. Editorial, Medium-caliber.
- **params**:
  - `quote` — string, "the quote body"
  - `author` — string, "attribution"
  - `hue` — number, default `40`, "accent hue (opening quote + underline)"
  - `align` — enum `['left','center']`, default `'left'`
- **duration_hint**: `4–8s`
- **aesthetic notes**: Opening `"` is 3× the body font size and colored with the accent. Body wraps at 20 words/line.
- **ai_prompt_example**: "Quote: 'Simplicity is the ultimate sophistication.' — da Vinci"

### sectionBreak
- **name**: `sectionBreak`
- **category**: Typography
- **description**: Full-frame chapter divider — a centered number (`01`, `02`...), a label, and two thin accent rules that scale in from center. Use between sections of a long-form video.
- **params**:
  - `number` — string, default `'01'`, "chapter number"
  - `label` — string, default `'INTRODUCTION'`
  - `hue` — number, default `30`, range `[0, 360]`
- **duration_hint**: `1.5–2.5s`
- **aesthetic notes**: Number is huge (40% of canvas height), label is tiny monospace, lines scale with `easeOutCubic`. Think Netflix chapter marker.
- **ai_prompt_example**: "Chapter 02 · The Architecture"

---

## 3. Shapes & Layout (5 scenes)

Procedural geometry. Fill the frame with pattern or composition.

### neonGrid
- **name**: `neonGrid`
- **category**: Shapes & Layout
- **description**: Synthwave perspective grid floor with a glowing horizon sun (striped for that 80s vibe), scrolling toward the camera, parallax stars above. Every line pure function of `t`.
- **params**:
  - `hueHorizon` — number, default `320`, "sun hue"
  - `hueGrid` — number, default `280`, "grid line hue"
  - `scrollSpeed` — number, default `0.4`, range `[0, 2]`
  - `lineCount` — integer, default `16`, range `[8, 32]`
  - `colCount` — integer, default `22`, range `[8, 48]`
- **duration_hint**: `5–30s`
- **aesthetic notes**: Grid compression near horizon is `u*u`, not linear — that's what sells the perspective. Horizon bar is a 6px glowing line. Reference: every synthwave album cover ever.
- **ai_prompt_example**: "Synthwave perspective grid with sunset"

### isoStack
- **name**: `isoStack`
- **category**: Shapes & Layout
- **description**: Isometric stack of rounded cubes/slabs that drop into place one by one with a soft bounce. Configurable stack height and palette.
- **params**:
  - `rows` — integer, default `4`, range `[1, 8]`
  - `cols` — integer, default `4`, range `[1, 8]`
  - `height` — integer, default `3`, "layers deep"
  - `hueStart` — number, default `200`
  - `hueEnd` — number, default `320`
- **duration_hint**: `3–6s`
- **aesthetic notes**: Drop stagger = `(row + col + layer) * 0.08`. Bounce via overshoot easing. Gradient fill per face so the iso is readable.
- **ai_prompt_example**: "Isometric tower of cubes dropping in, blue-to-purple"

### radialBurst
- **name**: `radialBurst`
- **category**: Shapes & Layout
- **description**: Rays radiating from a center point with varying length and thickness, rotating slowly. Classic manga/anime emphasis.
- **params**:
  - `rayCount` — integer, default `24`, range `[6, 60]`
  - `hue` — number, default `40`
  - `rotateSpeed` — number, default `0.15`, range `[0, 1]`
  - `jitter` — number, default `0.3`, range `[0, 1]`, "length irregularity"
- **duration_hint**: `2–8s`
- **aesthetic notes**: Use `lineWidth` variation per ray (seeded), not uniform. Add a bright center disk with shadowBlur.
- **ai_prompt_example**: "Gold radial burst for an emphasis moment"

### orbitRings
- **name**: `orbitRings`
- **category**: Shapes & Layout
- **description**: Concentric elliptical orbits with a glowing dot traveling along each. Like a planetary diagram. Pure sinusoidal motion.
- **params**:
  - `ringCount` — integer, default `5`, range `[2, 12]`
  - `hue` — number, default `200`
  - `tilt` — number, default `0.6`, range `[0.2, 1]`, "ellipse flattening"
- **duration_hint**: `6–30s`
- **aesthetic notes**: Each ring's speed is `1 / (ringIndex + 1)` (Kepler-ish). Dots have trailing arcs that fade.
- **ai_prompt_example**: "Solar system diagram, cyan, slowly orbiting"

### gridBlueprint
- **name**: `gridBlueprint`
- **category**: Shapes & Layout
- **description**: Architectural blueprint grid — a fine light grid over a darker coarse grid, with measurement tick marks and diagonal cross-hatches in corners. Good for tech/engineering videos.
- **params**:
  - `cellSize` — number, default `0.04`, "cell size as fraction of min(W,H)"
  - `hue` — number, default `200`
  - `showMarks` — boolean, default `true`
- **duration_hint**: `any`
- **aesthetic notes**: Coarse grid alpha = 0.15, fine grid alpha = 0.06. Small `+` ticks at every 5th intersection.
- **ai_prompt_example**: "Engineering blueprint grid background"

---

## 4. Data Viz (4 scenes)

Data-driven scenes. Params include a `data` array.

### barChartReveal
- **name**: `barChartReveal`
- **category**: Data Viz
- **description**: Editorial bar chart with staggered grow-in, HSL-interpolated bar colors, value labels that count up per bar, y-axis gridlines, and a glowing top edge on bars. Bloomberg/Stripe press-kit feel.
- **params**:
  - `data` — `{label:string, value:number}[]`, required
  - `title` — string, default `"MONTHLY GROWTH"`
  - `unit` — string, default `"%"`
  - `hueStart` — number, default `200`
  - `hueEnd` — number, default `320`
  - `stagger` — number, default `0.12`, "seconds between bars"
  - `barDur` — number, default `0.85`, "seconds per bar animation"
- **duration_hint**: `0.3 + data.length * stagger + barDur + 0.5`
- **aesthetic notes**: Value label counts from 0 to `value` by multiplying against `eased`. Rounded bar top (`quadraticCurveTo`). Glow on the top 2px of each bar once >50% revealed.
- **ai_prompt_example**: "柱状图：七个月的增长，从蓝色到紫色"

### lineChartDraw
- **name**: `lineChartDraw`
- **category**: Data Viz
- **description**: Line chart that draws itself left-to-right with a gradient stroke, glowing head point, and dotted y-axis gridlines. Optional filled area under the curve.
- **params**:
  - `data` — `number[]`, "y-values, evenly spaced"
  - `labels` — `string[]`, "x-axis labels (optional)"
  - `title` — string
  - `hueStart` — number, default `180`
  - `hueEnd` — number, default `320`
  - `fillArea` — boolean, default `true`
- **duration_hint**: `2–4s`
- **aesthetic notes**: Head point has `shadowBlur:20`. Fill area uses a vertical gradient that fades to transparent at the bottom.
- **ai_prompt_example**: "Line chart of weekly active users, fill area, teal"

### donutChart
- **name**: `donutChart`
- **category**: Data Viz
- **description**: Donut chart where each slice arcs in from 0° to its share. Center shows a large percent number for the first slice (counts up). Small legend.
- **params**:
  - `data` — `{label:string, value:number}[]`
  - `hues` — `number[]`, "optional per-slice hues"
  - `focusIndex` — integer, default `0`, "which slice drives the center label"
  - `stagger` — number, default `0.1`
- **duration_hint**: `2.5–4s`
- **aesthetic notes**: Slices have a 1px dark gap between them for crispness. Center number is monospace, 9 weight.
- **ai_prompt_example**: "Donut chart: 60% iOS, 30% Android, 10% Web"

### statBlock
- **name**: `statBlock`
- **category**: Data Viz
- **description**: A grid of 2–4 big-number statistics. Each stat has a label, a count-up number, and a unit. Staggered reveal. Think "By the numbers" slide.
- **params**:
  - `stats` — `{label:string, value:number, unit:string}[]`, 2–4 items
  - `hue` — number, default `30`
  - `stagger` — number, default `0.2`
- **duration_hint**: `2.5–4s`
- **aesthetic notes**: Numbers are 8–12% of canvas height, weight 900, with tabular numerics. Labels above, uppercase, monospace, dim.
- **ai_prompt_example**: "Stats: 10x faster, 50% cheaper, 3 days to ship"

---

## 5. Transitions (4 scenes)

Short (0.3–1.0s) bridges. Each renders a single overlay that evolves over its lifetime.

### wipeDiagonal
- **name**: `wipeDiagonal`
- **category**: Transitions
- **description**: A diagonal gradient band sweeps across the frame, optionally leaving a colored trail. The "incoming" content is behind it.
- **params**:
  - `direction` — enum `['tl-br','tr-bl','bl-tr','br-tl']`, default `'tl-br'`
  - `hue` — number, default `30`
  - `width` — number, default `0.25`, "band width as fraction of diagonal"
  - `duration` — number, default `0.6`
- **duration_hint**: `0.3–1.0s`
- **aesthetic notes**: The band is a rotated `linearGradient` with a bright core and transparent edges.
- **ai_prompt_example**: "Gold diagonal wipe transition"

### glitchCut
- **name**: `glitchCut`
- **category**: Transitions
- **description**: RGB-split + horizontal slice offset that intensifies then collapses. Use to "shock cut" between takes.
- **params**:
  - `intensity` — number, default `0.8`, range `[0, 1]`
  - `sliceCount` — integer, default `12`, range `[4, 40]`
  - `duration` — number, default `0.4`
- **duration_hint**: `0.25–0.6s`
- **aesthetic notes**: Slices are seeded — same `t` = same slice pattern. Peak intensity at `t=duration*0.6`.
- **ai_prompt_example**: "Hard glitch cut"

### zoomPunch
- **name**: `zoomPunch`
- **category**: Transitions
- **description**: A rapidly expanding circle from a focal point that covers the frame in a color, then contracts to reveal the next clip. Think punch-in.
- **params**:
  - `focusX` — number, default `0.5`, range `[0, 1]`
  - `focusY` — number, default `0.5`, range `[0, 1]`
  - `hue` — number, default `0`, "color of the cover"
  - `duration` — number, default `0.5`
- **duration_hint**: `0.3–0.8s`
- **aesthetic notes**: Use `easeInOutCubic` on radius. Add motion-blur streaks from center during the grow phase.
- **ai_prompt_example**: "White zoom-punch transition centered"

### inkBleed
- **name**: `inkBleed`
- **category**: Transitions
- **description**: Organic "ink" shape expands from a point via layered radial gradients with noisy edges, covering then uncovering.
- **params**:
  - `centerX` — number, default `0.5`
  - `centerY` — number, default `0.5`
  - `hue` — number, default `0`, "ink color (0 = black default)"
  - `duration` — number, default `0.8`
- **duration_hint**: `0.5–1.2s`
- **aesthetic notes**: Noise on the edge is seeded by floor(t*30). Looks hand-crafted when done right.
- **ai_prompt_example**: "Black ink bleed transition from bottom-left"

---

## 6. Overlays (5 scenes)

Sit on top of other scenes. zIndex high.

### lowerThirdVelvet
- **name**: `lowerThirdVelvet`
- **category**: Overlays
- **description**: Premium lower-third with a gradient bar that wipes in, a pulsing accent dot, title + subtitle that slide up from a clip mask, and a thin accent underline. Exits with a fade.
- **params**:
  - `title` — string, "primary label (name)"
  - `subtitle` — string, "role / description"
  - `hueA` — number, default `20`, "start hue of bar gradient"
  - `hueB` — number, default `320`, "end hue of bar gradient"
  - `holdEnd` — number, default `4.0`, "seconds until fade-out starts"
  - `fadeOut` — number, default `0.6`
- **duration_hint**: `4–8s`
- **aesthetic notes**: Gradient bar ends with an alpha fade (not a hard right edge). Dot pulses at 1.2Hz. Drop shadow under bar for depth. Reference: premium news/doc lower thirds.
- **ai_prompt_example**: "下三分之一：张三，产品经理，velvet 风格"

### captionKaraoke
- **name**: `captionKaraoke`
- **category**: Overlays
- **description**: Word-level karaoke captions — active word highlighted in accent color with subtle scale-up. Each word has `{text, start, end}` timing. Used with voiceover.
- **params**:
  - `words` — `{text:string, start:number, end:number}[]`
  - `hue` — number, default `40`, "active word hue"
  - `fontSize` — number, default `0.042`
  - `yPos` — number, default `0.86`, "vertical position"
- **duration_hint**: `matches words`
- **aesthetic notes**: Active word: `scale(1.05)`, full alpha, accent color. Inactive: `rgba(255,255,255,0.8)`. Drop shadow so text reads over any background.
- **ai_prompt_example**: "Karaoke captions timed to narration"

### chapterIndicator
- **name**: `chapterIndicator`
- **category**: Overlays
- **description**: Top-right HUD showing current chapter name + progress bar. Animates when chapter changes.
- **params**:
  - `chapters` — `{name:string, start:number}[]`
  - `totalDuration` — number, "total video length"
  - `hue` — number, default `200`
- **duration_hint**: `matches video`
- **aesthetic notes**: Progress bar is 120px wide, 3px tall. Chapter name transitions with a y-slide on change.
- **ai_prompt_example**: "HUD chapter indicator in top right"

### progressRing
- **name**: `progressRing`
- **category**: Overlays
- **description**: Circular progress arc with a center number (percent). Good for countdowns and loaders.
- **params**:
  - `progress` — number, range `[0, 1]`, "defaults to `t/dur`"
  - `hue` — number, default `200`
  - `label` — string, default `""`
  - `size` — number, default `0.18`, "diameter as fraction of min(W,H)"
- **duration_hint**: `any`
- **aesthetic notes**: Arc has a bright head with `shadowBlur`. Center number counts up in monospace.
- **ai_prompt_example**: "Circular progress ring at 70%"

### badgePill
- **name**: `badgePill`
- **category**: Overlays
- **description**: A small pill-shaped label ("LIVE", "NEW", "BETA") in a corner with a pulsing dot. Loops indefinitely.
- **params**:
  - `text` — string, default `"LIVE"`
  - `corner` — enum `['tl','tr','bl','br']`, default `'tr'`
  - `hue` — number, default `0`
  - `pulse` — boolean, default `true`
- **duration_hint**: `any`
- **aesthetic notes**: Pill has a soft drop shadow. Dot pulses at 1.5Hz. Weight 800 text.
- **ai_prompt_example**: "Red LIVE badge top-right"

---

## Totals

- **Backgrounds**: 5 scenes
- **Typography**: 5 scenes
- **Shapes & Layout**: 5 scenes
- **Data Viz**: 4 scenes
- **Transitions**: 4 scenes
- **Overlays**: 5 scenes
- **TOTAL**: **28 scenes**

---

## AI operation interface

This is the contract between AI agents (via the R3 bridge crate) and the scene library. AI never instantiates a scene directly — it calls into the timeline API, and the timeline resolves `scene` names against the registry.

### Registry

Every scene registers into a global object exposed by the runtime:

```js
// runtime/scenes/index.js (built from spec/scene-library-ref/*.js + more)
import { auroraGradient }   from './auroraGradient.js';
import { kineticHeadline }  from './kineticHeadline.js';
// ... all 28

export const SCENE_REGISTRY = {
  auroraGradient:   { fn: auroraGradient,   category: 'Backgrounds', paramSchema: {...} },
  kineticHeadline:  { fn: kineticHeadline,  category: 'Typography',  paramSchema: {...} },
  // ...
};
```

### Methods (exposed by R3 bridge to AI)

```ts
// List all scenes, optionally filtered
bridge.scenes.list(category?: string): SceneMeta[]

// Get full schema for one scene (for AI to understand params)
bridge.scenes.describe(name: string): {
  name: string
  category: string
  description: string
  params: ParamSchema[]
  duration_hint: [number, number]  // [min, max] seconds
  ai_prompt_example: string
}

// Add a clip to the timeline
bridge.timeline.addClip({
  trackId: string
  scene: string         // must exist in SCENE_REGISTRY
  start: number         // seconds
  dur: number           // seconds
  zIndex?: number
  params: object        // validated against scene's paramSchema
}): { clipId: string }

// Patch an existing clip's params (partial update)
bridge.timeline.patchClip(clipId: string, patch: {
  params?: object       // merged, not replaced
  start?: number
  dur?: number
  zIndex?: number
}): void

// Delete a clip
bridge.timeline.removeClip(clipId: string): void

// Preview a scene standalone at time t (used by AI to "look at" its work)
bridge.scenes.preview(name: string, params: object, t: number): Promise<PngBlob>
```

### Natural-language flow (what R3 does)

1. User: "给这段视频加个金色的标题动画叫 Design In Motion"
2. LLM calls `bridge.scenes.list('Typography')` → gets list of 5 scenes
3. LLM reads `ai_prompt_example` fields, matches `kineticHeadline`
4. LLM calls `bridge.scenes.describe('kineticHeadline')` → gets param schema
5. LLM calls `bridge.timeline.addClip({ trackId: 't_title', scene: 'kineticHeadline', start: 0, dur: 4, params: { text: 'DESIGN IN MOTION', hueStart: 30, hueEnd: 40 } })`
6. LLM calls `bridge.scenes.preview('kineticHeadline', params, t=2.0)` to verify the result looks right (AI eyeballs its own output — the "AI can see" principle).

### Param schema format (JSON-schema-lite)

Every scene declares its schema as:

```js
export const kineticHeadlineSchema = {
  text:     { type: 'string',  default: 'DESIGN IN MOTION' },
  subtitle: { type: 'string',  default: '' },
  hueStart: { type: 'number',  default: 30,  min: 0, max: 360, ui: 'hue' },
  hueEnd:   { type: 'number',  default: 320, min: 0, max: 360, ui: 'hue' },
  stagger:  { type: 'number',  default: 0.18, min: 0.05, max: 0.5, unit: 's' },
  size:     { type: 'number',  default: 0.12, min: 0.05, max: 0.25 },
};
```

R3 reads this schema and exposes it to:
- The inspector panel (auto-generates form controls)
- The LLM tool-use JSON schema (so the model knows what values to pick)
- Runtime validation (rejects out-of-range values before they hit the renderer)

---

## Reference implementations

The `spec/scene-library-ref/` directory ships 5 fully-implemented reference scenes, one from each category we care most about, along with a `demo.html` that renders all 5 in a 16:9 grid on a looping rAF clock:

| File | Category |
|------|----------|
| `auroraGradient.js`   | Backgrounds |
| `kineticHeadline.js`  | Typography |
| `neonGrid.js`         | Shapes & Layout |
| `barChartReveal.js`   | Data Viz |
| `lowerThirdVelvet.js` | Overlays |
| `demo.html`           | Renders all 5 in a grid, loops t per scene |

**Transitions** category does not have a reference implementation in v1 — transitions are 0.3s clips and benefit from side-by-side viewing of outgoing/incoming content which the 5-up demo doesn't provide. They'll ship in the walking-skeleton pass.

Open `demo.html` via `file://` or a local static server. No build step. No dependencies.

---

## Quality bar checklist (per scene)

Before a scene can ship:

- [ ] Pure function signature: `(t, params, ctx, globalT) => void`
- [ ] No top-level `let`/`var` in the scene file (imports + `const` only)
- [ ] No `Math.random()`, no `performance.now()`, no `Date.now()`
- [ ] Reads canvas size from `ctx.canvas.width` / `ctx.canvas.height`
- [ ] Fades in over `t < 0.3s` via `smoothstep` (unless the scene is meant to hard-cut)
- [ ] Every hue/color is parameterized — no hardcoded `#ff00ff` in the hot path
- [ ] At least one of: gradient, glow (shadowBlur), grain, or HSL interpolation
- [ ] Testable by calling at `t = 0`, `t = dur/2`, `t = dur` — produces 3 visually distinct stable frames
- [ ] `ai_prompt_example` exists and is natural language (EN or ZH)
- [ ] Shows up in at least one entry in the spec taxonomy above

---

## Long-term roadmap

- **v1**: ship these 28 scenes with the 5-scene reference in `scene-library-ref/`
- **v1.1**: implement the remaining 23, add preview thumbnails (captured by rendering each scene at `t = dur/2`)
- **v1.2**: expose `bridge.scenes.*` to the AI layer, wire the LLM tool calls
- **v1.3**: community scene contributions via a single-file `.scene.js` format that exports `{default: fn, schema, meta}`
- **v2**: AI-authored scenes — feed Claude the source of 10 scenes and let it write new ones against the spec
