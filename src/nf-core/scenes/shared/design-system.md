# NextFrame Component Design System

## Directory Structure

```
scenes/
├── _template/              AI copies this to start a new component
├── shared/                 Cross-theme utilities (not components)
├── {ratio}/                9x16, 16x9, 1x1
│   └── {theme}/            interview-dark, lecture-light, ...
│       ├── design.md       Style guide for this theme
│       ├── tokens.js       All visual values (colors, sizes, spacing)
│       └── {category}/     backgrounds, typography, data, media, overlays, brand, shapes
│           └── {component}/
│               ├── index.js      Render function
│               ├── meta.json     Component contract
│               ├── preview.json  Preview parameters for snapshots
│               └── thumb.png     Generated thumbnail (256x456 for 9:16, 456x256 for 16:9)
```

## Categories

| Category | Purpose | Example Components |
|----------|---------|--------------------|
| **backgrounds** | Full-canvas fills | gradient, particle grid, solid, texture |
| **typography** | Text-dominant layers | headline, quote, bullet list, code block, lower third |
| **data** | Data visualization | bar chart, line chart, counter, stat card, gauge |
| **media** | Video/image containers | video area, split screen, image pan, browser mockup |
| **overlays** | UI elements on top | subtitle, progress bar, annotation, watermark |
| **brand** | Identity elements | logo reveal, brand footer, end card |
| **shapes** | Decorative geometry | divider, glow circle, scan line, grid pattern |

## Component Contract (meta.json)

Every component MUST have a meta.json with these fields:

```json
{
  "id": "componentId",
  "name": "Human-readable name",
  "description": "One sentence: what it does",
  "version": "1.0.0",
  "author": "nextframe",
  "license": "MIT",
  "category": "typography",
  "tags": ["keyword1", "keyword2"],
  "ratio": "9:16",
  "theme": "interview-dark",
  "videoOverlay": false,
  "duration": {
    "min": 2,
    "max": 300,
    "default": 60
  },
  "enter": { "effect": "fadeIn", "dur": 0.5 },
  "exit": { "effect": "fadeOut", "dur": 0.5 },
  "params": {
    "paramName": {
      "type": "string|number|boolean|array|object",
      "required": true,
      "default": "value",
      "description": "What this param does",
      "example": "Example value",
      "min": 0,
      "max": 100,
      "enum": ["option1", "option2"]
    }
  }
}
```

### Required Fields

- id, name, description, version, category, ratio, theme, params
- Each param MUST have: type, description
- Each param with type "number" SHOULD have: min, max, default
- Each param with finite options MUST have: enum

### videoOverlay

Set `true` if the component renders a video placeholder that the recorder replaces with real video via ffmpeg overlay. The timeline layer MUST include `videoOverlay: {x, y, w, h}` percentage coordinates.

## Component Code (index.js)

### Exports

Every index.js MUST export:

```js
export const meta = { /* from meta.json or inline */ };
export function render(t, params, vp) { /* → HTML string */ }
export function screenshots() { /* → [{ t, params }] */ }
```

### Rules

1. **Pure function**: `render(t, params, vp)` returns HTML string, no side effects
2. **Tokens only**: All colors, sizes, fonts from `tokens.js` — zero hardcoded hex values
3. **No cross-imports**: Components cannot import from other components
4. **No frameworks**: Plain HTML + inline CSS + vanilla JS only
5. **Max 500 lines**: If longer, split into helper functions in the same file
6. **No var**: Use const/let only
7. **No console.log**: Silent in production

### Token Usage

```js
// At top of index.js
import { getTokens } from '../../tokens.js';

function render(t, params, vp) {
  const T = getTokens();
  return `<div style="
    color: ${T.title};
    font-size: ${T.titleSize};
    font-family: ${T.fontCn};
    background: ${T.bg};
  ">...</div>`;
}
```

## Token Slots

Every theme's tokens.js MUST export `getTokens()` returning an object with AT LEAST these slots:

### Colors (required)
| Slot | Purpose |
|------|---------|
| title | Primary heading color |
| body | Body text color |
| bodyDim | Secondary/muted text |
| accent | Highlight/emphasis color |
| bg | Main background |
| bgCard | Card/panel background |
| border | Border/separator color |

### Typography (required)
| Slot | Purpose |
|------|---------|
| titleSize | Main title font size |
| subtitleSize | Subtitle font size |
| bodySize | Body text font size |
| labelSize | Small label font size |
| fontCn | Chinese font stack |
| fontEn | English/Latin font stack |

### Spacing (required)
| Slot | Purpose |
|------|---------|
| padding | Edge padding in px |
| gap | Element gap in px |
| radius | Border radius |
| radiusSmall | Small border radius |

### Category-Specific Slots (optional)

Themes MAY add extra slots for specific categories:

- **data**: `dataPrimary, dataSecondary, dataTertiary, axisColor, gridColor`
- **media**: `mediaBorder, mediaShadow, overlayBg`
- **brand**: `logoColor, taglineColor`

## Preview & Verification

### preview.json

```json
{
  "params": { "title": "Example Title", "subtitle": "Example" },
  "snapshots": [
    { "t": 0, "label": "Initial" },
    { "t": 5, "label": "Steady state" }
  ]
}
```

### AI Self-Verification Flow

```bash
# 1. Preview single component
nextframe scene-preview {ratio}/{theme}/{category}/{component}

# 2. Read screenshot
Read snapshots/t5.png → confirm content visible, layout correct

# 3. Check no hardcoded colors
grep '#[0-9a-fA-F]' index.js → must be zero matches

# 4. Validate meta.json
nextframe scene-validate {component}
```

### Theme-Level Verification

```bash
# Verify all components in a theme
nextframe theme-verify {ratio}/{theme}
# Checks: meta.json complete, no hardcoded hex, screenshots not blank, ≤500 lines
```

## Timeline Integration

Timeline JSON references components by id. Theme is specified at timeline level:

```json
{
  "ratio": "9:16",
  "theme": "interview-dark",
  "layers": [
    { "id": "bg", "scene": "interviewBg", "start": 0, "dur": 60, "params": {} }
  ]
}
```

The build pipeline resolves `interviewBg` → `scenes/9x16/interview-dark/backgrounds/interviewBg/index.js`.

## Adding a New Theme

1. Create `scenes/{ratio}/{theme-name}/`
2. Write `design.md` — describe the visual style, rules, and feel
3. Write `tokens.js` — fill all required token slots
4. Copy components from `_template/` or an existing theme
5. Replace all token references to use the new tokens
6. Run `nextframe theme-verify` to validate

## Adding a New Component

1. Read the theme's `design.md` — understand the style
2. Copy `_template/` to the correct category directory
3. Write `meta.json` — fill all required fields
4. Write `index.js` — render function using tokens from `tokens.js`
5. Write `preview.json` — default params for snapshot generation
6. Run `nextframe scene-preview` and verify screenshots
7. Check: `grep '#[0-9a-fA-F]' index.js` returns nothing
