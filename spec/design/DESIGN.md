# Design System of NextFrame

## 1. Visual Theme & Atmosphere

NextFrame's interface feels like editing video inside a piece of obsidian — a near-black void (`#050507`) where panels float as translucent glass slabs, catching faint purple aurora light that bleeds in from the edges of the screen. The design philosophy borrows from three sources: Linear's information density without clutter, Raycast's macOS-native glass depth, and Vercel's dark minimalism with a single accent color. The result is a desktop application that reads as a professional instrument — quiet, precise, and confident.

The signature element is the 3D glass panel system. Every surface — sidebars, timelines, property panels, cards — uses a four-layer construction: backdrop-filter blur that lets aurora light bleed through, a black translucent tint (`rgba(0,0,0,0.50)`) that anchors readability, inset box-shadows that simulate a bright top edge and dark bottom edge (as if light falls from above onto frosted glass), and a specular gradient highlight that catches the eye at the upper-left corner. The glass background is always black-based, never tinted purple — the purple comes exclusively from the aurora bleeding through the blur, creating the impression of colored light refracting through a dark lens.

Typography is built on Inter for all UI surfaces, Noto Serif SC for reading-weight script content (the text users spend minutes studying), and JetBrains Mono for data values, timecodes, and code. The type scale is designed for a desktop application viewed at arm's length: minimum 12px, minimum opacity 0.50 — nothing on screen should require squinting or leaning in. Antialiased rendering is mandatory.

**Key Characteristics:**
- Near-black background (`#050507`) with subtle purple aurora at top and bottom screen edges
- 3D glass panel system: `rgba(0,0,0,0.50)` + `blur(16px)` + inset shadow edges + specular highlight
- Two accents: purple `#a78bfa` (interactive/selection) + deep orange `#f97316` (data/emphasis/energy) — cold + warm creates visual temperature
- Minimum font size 12px, minimum text opacity 0.50 — readability is a hard constraint, not a preference
- Inter + Noto Serif SC + JetBrains Mono — three fonts, strict separation of roles
- `cubic-bezier(0.16, 1, 0.3, 1)` as the universal easing — no `ease`, no `linear`
- Card-based layout over table layout — each content block is an independent glass panel
- Stagger animation at 60ms intervals for sequential elements — cascade, not pop

## 2. Color Palette & Roles

### Background
- **Void** (`#050507`): Page canvas. Near-black with an imperceptible cool undertone. Not pure black — pure black is lifeless.
- **Aurora Top**: `radial-gradient(ellipse 60% 12% at 50% 2%, rgba(139,92,246,0.10), transparent)` — faint purple glow at the top screen edge.
- **Aurora Bottom**: `radial-gradient(ellipse 60% 12% at 50% 98%, rgba(124,58,237,0.05), transparent)` — fainter purple at the bottom.
- **Warm Glow**: `radial-gradient(ellipse 40% 10% at 80% 98%, rgba(249,115,22,0.04), transparent)` — subtle deep orange warmth at bottom-right corner.
- **Glass Surface** (`rgba(0,0,0,0.50)`): Panel backgrounds. Black-tinted, never color-tinted. Color arrives only via aurora bleed through backdrop blur.

### Accent — single purple, four densities
- **Accent Solid** (`#a78bfa`): Primary buttons, active tab indicators, playhead, links. The one color that means "interactive" or "active."
- **Accent 20** (`rgba(167,139,250,0.20)`): Hover states on accent elements, active backgrounds under pressure.
- **Accent 12** (`rgba(167,139,250,0.12)`): Badges, soft buttons, selected list items, tag fills.
- **Accent 06** (`rgba(167,139,250,0.06)`): Subtle list active backgrounds, barely-there emphasis.

### Warm — deep orange, secondary emphasis
- **Warm Solid** (`#f97316`): Data numbers, character counts, durations, logic/reasoning text. Adds warmth to the cold purple palette.
- **Warm 20** (`rgba(249,115,22,0.20)`): Hover states on warm elements.
- **Warm 12** (`rgba(249,115,22,0.12)`): Warm badges, progress indicators.
- **Warm 06** (`rgba(249,115,22,0.06)`): Subtle warm backgrounds.

**Two-color rule**: Purple = interactive/selection (buttons, tabs, active states). Orange = data/emphasis/energy (numbers, stats, durations, logic). Never swap them.

### Text — four levels, hard floor at 0.50
- **Primary** (`rgba(255,255,255,0.95)`): Headings, active items, primary data values, card titles. Near-white, not pure white — prevents glare on dark surfaces.
- **Body** (`rgba(255,255,255,0.80)`): Default reading text, input values, button labels. The workhorse text color.
- **Secondary** (`rgba(255,255,255,0.65)`): Descriptions, secondary labels, inactive list items.
- **Minimum** (`rgba(255,255,255,0.50)`): The absolute floor. Captions, timestamps, version numbers, inactive tabs. Nothing goes below this.

### Semantic — status only, never decoration
| Name | Hex | Background | Border | Use |
|------|-----|-----------|--------|-----|
| Green | `#34d399` | `rgba(52,211,153,0.12)` | `rgba(52,211,153,0.20)` | Done, success, positive delta, render complete |
| Yellow | `#fbbf24` | `rgba(251,191,36,0.12)` | `rgba(251,191,36,0.20)` | Pending, warning, encoding in progress |
| Red | `#f87171` | `rgba(248,113,113,0.12)` | `rgba(248,113,113,0.20)` | Error, fail, negative delta, export failed |
| Blue | `#38bdf8` | `rgba(56,189,248,0.12)` | `rgba(56,189,248,0.20)` | Info, link, neutral status, audio track |
| Pink | `#f472b6` | `rgba(244,114,182,0.12)` | `rgba(244,114,182,0.20)` | Special highlights, voiceover track |

### Border
- **Default** (`rgba(255,255,255,0.08)`): Standard panel and card borders. Barely visible, structurally essential.
- **Hover** (`rgba(255,255,255,0.14)`): Interactive element hover state.
- **Focus** (`rgba(167,139,250,0.35)`): Input focus, active selection.
- **Light** (`rgba(255,255,255,0.05)`): Nested elements, inset borders, section dividers.

## 3. Typography Rules

### Font Family
- **UI**: `Inter`, -apple-system, system-ui, sans-serif — all interface text, buttons, labels, navigation
- **Reading**: `Noto Serif SC`, Georgia, serif — script content, long-form text that users study for minutes
- **Data**: `JetBrains Mono`, SF Mono, Menlo, monospace — timecodes, values, paths, code

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Color | Notes |
|------|------|------|--------|-------------|----------------|-------|-------|
| Page Title | Inter | 28px | 700 | 1.3 | -0.3px | 0.95 | One per page, top of hierarchy |
| Section Title | Inter | 20px | 600 | 1.3 | -0.2px | 0.95 | Panel headers, major sections |
| Card Title | Inter | 16px | 600 | 1.3 | normal | 0.95 | Card headers, list group titles |
| Body | Inter | 14px | 400 | 1.5 | normal | 0.80 | Default reading text, descriptions |
| Body Medium | Inter | 14px | 500 | 1.5 | normal | 0.80 | Button text, nav items, labels |
| Secondary | Inter | 13px | 400–500 | 1.6 | normal | 0.65 | Meta info, supporting text |
| Caption | Inter | 12px | 500–600 | 1.4 | 0.04em | 0.50 | MINIMUM. Badges, timestamps, captions |
| Reading | Noto Serif SC | 18px | 400 | 2.0 | normal | 0.95 | Script text, content users study |
| Data | JetBrains Mono | 13px | 400–500 | 1.5 | normal | 0.65–0.80 | Timecodes, values, paths |
| Data Large | JetBrains Mono | 32px | 700 | 1.2 | -0.5px | 0.95 | Stat numbers, hero data |

### Rendering
```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```
Always. Every page, every component. No exceptions.

### Hard Rules
- **Minimum font size: 12px.** Nothing smaller. This is a desktop app, not a mobile web page.
- **Minimum text opacity: 0.50.** If text is worth putting on screen, it's worth being readable.
- **Body text weight 500 on dark surfaces.** Medium weight prevents thin strokes from disappearing against dark backgrounds.
- **Caption text weight 500–600.** Small text at 12px needs extra weight to remain crisp.

## 4. Component Stylings

### CRITICAL: Overlapping panels must be OPAQUE

```
ANY panel that floats over other content — dropdowns, modals, popovers,
context menus, tooltips, command palette — MUST use opaque background #141416.

NOT translucent glass. NOT backdrop-filter blur. OPAQUE.

Reason: translucent panels let content bleed through, making text unreadable.
Glass is ONLY for side-by-side panels (sidebars, toolbars, timelines) where
nothing is behind them except the aurora background.
```

### 3D Glass Panel (core surface — side-by-side panels only)
```css
.glass {
  border-radius: 14px;
  overflow: hidden;
  backdrop-filter: blur(16px) saturate(1.4);
  background: rgba(0,0,0,0.50);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow:
    inset 0 1px 0 0 rgba(255,255,255,0.09),  /* top bright edge — light from above */
    inset 0 -1px 0 0 rgba(0,0,0,0.15),        /* bottom dark edge — shadow below */
    0 2px 8px rgba(0,0,0,0.20);                /* drop shadow — panel floats */
}
/* Specular highlight ::before */
background:
  linear-gradient(178deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 3%, transparent 12%),
  linear-gradient(92deg, rgba(255,255,255,0.025) 0%, transparent 3%, transparent 97%, rgba(255,255,255,0.015) 100%);
```
Use: Every panel, sidebar, timeline, card, toolbar, footer.

**Glass Inset** (nested inside glass)
- Background: `rgba(255,255,255,0.03)`
- Border: `1px solid rgba(255,255,255,0.05)`
- Shadow: `inset 0 1px 0 rgba(255,255,255,0.04)`
- Use: Input fields inside panels, nested containers, inner sections.

**Glass Elevated** (dropdowns, modals, popovers)
- Background: `#141416` — **opaque, not translucent.** Dropdowns overlay content; translucency makes text unreadable.
- Border: `1px solid rgba(255,255,255,0.10)`
- Shadow: `0 8px 30px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.06)`
- Use: Dropdown menus, command palette, modals, context menus, tooltips — anything that floats over content.
- **RULE**: If a panel overlaps other content, it must be opaque. Translucency is only for panels that sit side-by-side (sidebars, toolbars, timelines).

### Buttons

| Type | Background | Text | Border | Shadow | Use |
|------|-----------|------|--------|--------|-----|
| Primary | `#a78bfa` solid | `rgba(0,0,0,0.90)` | None | `inset 0 1px 0 rgba(255,255,255,0.08)` | Main CTA — max 1 per view |
| Accent Soft | `rgba(167,139,250,0.12)` | `#a78bfa` | `rgba(167,139,250,0.20)` | `inset 0 1px 0 rgba(255,255,255,0.06)` | Secondary with emphasis |
| Secondary | `rgba(255,255,255,0.06)` | `0.80 white` | `rgba(255,255,255,0.08)` | `inset 0 1px 0 rgba(255,255,255,0.06)` | Default action |
| Ghost | Transparent | `0.65 white` | `rgba(255,255,255,0.05)` | None | Tertiary, cancel, back |

Sizes: `sm` (6px 12px pad, 12px font), `default` (8px 20px, 13px font), `lg` (12px 32px, 14px font).
Hover: Primary brightens 12%, others increase background opacity. All transitions use `--ease`.

### Cards
- Glass panel + 20–24px padding
- Optional badge: 12px weight 700 uppercase, accent-12 bg, accent text, 5px radius
- Title: 16px weight 600, 0.95 opacity
- Body: 14px weight 400, 0.65 opacity, line-height 1.7
- Footer: row of buttons with 8px gap
- **Height: auto (content-driven).** Cards must NOT have fixed height. Content dictates height. No overflow hidden on card body.
- **Two-column cards** (text + meta): meta column min-width 260px, flex-shrink 0. Text column flex 1. Both columns independently scroll if needed, but prefer auto-height.
- **Meta column readability**: meta labels at `--t50` (0.50), meta values at `--t80` (0.80) minimum. Never use `--t65` for meta values — they must be clearly readable against glass background.

### Badges & Pills

**Status Badge** (rounded pill)
- Font: 12px weight 600
- Padding: 4px 12px
- Radius: 20px
- Each semantic color has its own bg + text + border combo (see Color section)

**Filter Pill** (toggleable)
- Font: 13px weight 500
- Padding: 6px 16px
- Radius: 6px
- Inactive: transparent bg, 0.50 text
- Active: accent-12 bg, accent text, accent-20 border

### List Items
- Full-width row: 12px 16px padding
- Left border: 2px, transparent default, accent when active
- Icon: 28px square, 6px radius, accent-12 bg when active
- Text: 14px, 0.65 default, 0.95 when active (weight bumps to 500)
- Meta: 12px mono, 0.50 opacity
- Hover: `rgba(255,255,255,0.025)` background

### Inputs
- Glass-inset background
- Font: 14px Inter
- Padding: 8px 12px
- Placeholder: 0.50 opacity
- Focus: accent border (`rgba(167,139,250,0.35)`), slightly brighter bg
- Height: ~36px

### Audio Sentence Playback (karaoke)
- Each sentence is a visible row inside the audio card: timecode (mono) + text + duration
- **Active sentence**: accent left border (2px), background `--accent-06`, text at `--t100`
- **Inactive sentence**: no border, transparent bg, text at `--t80`
- **Progress bar per sentence**: 3px track below text, accent fill animates left-to-right during playback
- **Character highlighting**: current word/character uses `--accent` color, spoken characters at `--t100`, unspoken at `--t50`
- Play button per segment card: toggles playback, accent bg when playing
- Sentence rows must be clearly separated with enough padding (8-12px vertical) and readable timecodes

### Slider
- Track: 3px height, `rgba(255,255,255,0.06)` bg, inset shadow
- Fill: accent color at 0.6 opacity
- Thumb: 14px circle, white 0.88, 2px accent border, subtle drop shadow

## 5. Layout Principles

### Spacing System (8-point grid)
| Token | Value | Use |
|-------|-------|-----|
| `--sp-4` | 4px | Inline gaps, icon padding |
| `--sp-6` | 6px | Tight component gaps |
| `--sp-8` | 8px | Default small gap |
| `--sp-12` | 12px | Component gaps, list item padding |
| `--sp-16` | 16px | Section padding |
| `--sp-20` | 20px | Card padding |
| `--sp-24` | 24px | Large card padding |
| `--sp-32` | 32px | Section gaps |
| `--sp-48` | 48px | Page section spacing |

### Grid & Container
- **App shell**: Topbar (48px) fixed at top. Content area fills remaining height.
- **Sidebar + Main**: Default layout. Sidebar 200–260px, main flexible.
- **Panel gaps**: 4–8px between sibling glass panels. Tight, not loose — the dark background between panels is the breathing room.
- **Content padding**: 8px around the content area (inside topbar).

### Whitespace Philosophy
The near-black background IS the whitespace. Glass panels float on darkness with 4–8px gaps between them. The dark void provides natural separation without dividers. Inside panels, 16–24px padding gives content room to breathe. The rule: if you can't tell where one section ends and another begins, add a glass panel boundary — not a line, not a gap, a panel.

### Border Radius Scale
| Token | Value | Use |
|-------|-------|-----|
| `--r-lg` | 16px | Large panels, modals |
| `--r` | 14px | Cards, panels (the default) |
| `--r-sm` | 10px | Buttons, inputs, inner panels |
| `--r-xs` | 6px | Badges, pills, small controls |

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Void (0) | No shadow, `#050507` bg | Page background, the deepest layer |
| Glass (1) | Inset top bright + inset bottom dark + drop shadow | Standard glass panels — the workhorse |
| Glass Hover (2) | Same as Glass but `translateY(-2px)` + stronger drop shadow (`0 6px 20px`) | Interactive panels on hover |
| Elevated (3) | `#141416` **opaque** + `0 8px 30px rgba(0,0,0,0.60)` | Dropdowns, popovers — must be opaque, never translucent |
| Modal (4) | Elevated + `rgba(0,0,0,0.60)` backdrop overlay | Modal dialogs, command palette |

### Shadow Philosophy
On dark backgrounds, traditional shadows (dark on dark) are invisible. NextFrame uses the Raycast approach: **inset highlights** simulate light falling on glass from above. The bright top edge (`rgba(255,255,255,0.09)` inset) and dark bottom edge (`rgba(0,0,0,0.15)` inset) create a physical illusion — the panel feels like a frosted glass slab lit from overhead. The outer drop shadow (`0 2px 8px rgba(0,0,0,0.20)`) lifts the panel off the background. This three-layer shadow system is applied uniformly to every glass surface.

## 7. Do's and Don'ts

### Do
- Use glass panels for every distinct content region — no flat rectangles on the void
- Use `rgba(0,0,0,0.50)` for glass background — black-based, never color-tinted
- Use `--t80` (0.80) or higher for any text users need to read
- Use `--t100` (0.95) for headings, active items, and primary data
- Use weight 500–600 for text at 12–13px — small text needs extra heft on dark backgrounds
- Use stagger animation (60ms) for sequential elements entering the screen
- Use hover-lift (`translateY(-2px)` + deeper shadow) on interactive glass cards
- Use antialiased font rendering on every page
- Keep accent color usage sparse — it means "important" or "interactive"
- Let card height be auto (content-driven) — never set fixed height on content cards
- Use `--t80` (0.80) minimum for meta values in two-column cards — right-side content must be readable
- Test readability on an actual screen, not just in code

### Don't
- Use text opacity below 0.50 — invisible on dark backgrounds
- Use font-size below 12px — unreadable at desktop viewing distance
- Tint glass panels with purple — purple comes only from aurora bleed-through
- Use `box-shadow` for visual separation between elements — use 1px borders
- Use `ease` or `linear` easing — always `cubic-bezier(0.16, 1, 0.3, 1)`
- Animate layout properties (width, height, padding, margin) — only opacity + transform
- Put more than 1 primary (solid accent) button per view
- Use gradients on UI elements — gradients are exclusively for the background aurora
- Use decorative gray text that serves no function — if it's not worth reading, delete it
- Set fixed height on content cards — height must be auto, driven by content. Overflow hidden on card body = content gets cut off
- Use `--t65` for meta values in two-column layouts — meta values need `--t80` minimum to be readable on glass background
- Use film grain overlays — the 3D glass system provides sufficient texture
- Use translucent/glass background on overlapping panels (dropdowns, modals, popovers, tooltips) — they must be opaque (`#141416`), otherwise the content underneath bleeds through and text becomes unreadable

## 8. Responsive Behavior

NextFrame is a **desktop application**. Responsive behavior is minimal — the app runs in a native window, not a browser viewport.

### Window Sizes
| Name | Width | Key Changes |
|------|-------|-------------|
| Compact | <1024px | Sidebar collapses, main area fills width |
| Standard | 1024–1440px | Full layout: sidebar + main |
| Wide | >1440px | Panels gain extra padding, max content width applies |

### Panel Collapsing
- Sidebar hides at compact widths, toggle to show
- Property panel can be toggled off to give more space to the main content
- Timeline height is resizable via drag handle

### Touch Targets (not primary, but for trackpad)
- Buttons: minimum 36px height with 8px padding
- List items: 12px vertical padding creates ~40px touch targets
- Slider thumbs: 14px diameter, adequate for trackpad clicking

## 9. Agent Prompt Guide

### Quick Color Reference
- Page Background: Near-Black (`#050507`)
- Glass Surface: `rgba(0,0,0,0.50)` + `blur(16px)`
- Accent: Purple (`#a78bfa`)
- Accent Hover: `rgba(167,139,250,0.20)`
- Accent Badge: `rgba(167,139,250,0.12)`
- Primary Text: `rgba(255,255,255,0.95)`
- Body Text: `rgba(255,255,255,0.80)`
- Secondary Text: `rgba(255,255,255,0.65)`
- Minimum Text: `rgba(255,255,255,0.50)`
- Border Default: `rgba(255,255,255,0.08)`
- Warm: Deep Orange (`#f97316`)
- Warm Badge: `rgba(249,115,22,0.12)`
- Aurora Top: `rgba(139,92,246,0.10)` at 50% 2%
- Aurora Bottom: `rgba(124,58,237,0.05)` at 50% 98%
- Warm Glow: `rgba(249,115,22,0.04)` at 80% 98%

### Design Identity Prompt
When prompting AI to generate NextFrame UI pages, use this anchor:

> "A desktop video editor UI in the style of Linear's cleanliness, Raycast's 3D glass depth, and Vercel's dark minimalism. Near-black background with faint purple aurora. All panels are 3D frosted glass (black translucent, inset shadow edges, specular highlight). One accent color: purple #a78bfa. Minimum font 12px, minimum text opacity 0.50. Fonts: Inter for UI, Noto Serif SC for reading content, JetBrains Mono for data. Animation: cubic-bezier(0.16,1,0.3,1), fadeUp entry, 60ms stagger. Quality priority: readability first, cleanliness second, depth third."

### Example Component Prompts
- "Create a glass sidebar on `#050507` background with aurora. Glass panel: `rgba(0,0,0,0.50)` bg, `blur(16px)`, `1px solid rgba(255,255,255,0.08)` border, 14px radius, inset shadow (bright top `rgba(255,255,255,0.09)`, dark bottom `rgba(0,0,0,0.15)`), `0 2px 8px rgba(0,0,0,0.20)` drop. 12px uppercase section title at 0.50 opacity, list items with 28px icon squares and 14px Inter text at 0.65 (active: 0.95 + accent left border)."
- "Design a script card: glass panel, 24px padding. Badge: 12px weight 700 uppercase `#a78bfa` on `rgba(167,139,250,0.12)`. Title: 16px Inter weight 600 at 0.95. Body: Noto Serif SC 18px line-height 2.0 at 0.95. Meta sidebar 280px with 12px uppercase labels at 0.50 and 13px values at 0.65."
- "Build a stat card: glass panel, 20px padding. Label: 12px weight 600 uppercase at 0.50. Value: 32px JetBrains Mono weight 700 at 0.95. Delta: 13px weight 600, green `#34d399` for positive, red `#f87171` for negative."
- "Create a button row: Primary (`#a78bfa` solid, black text), Accent Soft (`rgba(167,139,250,0.12)` bg, accent text, accent border), Secondary (`rgba(255,255,255,0.06)` bg, 0.80 text, glass border), Ghost (transparent, 0.65 text, light border). All 13px Inter weight 600, 8px 20px padding, 6px radius, `inset 0 1px 0 rgba(255,255,255,0.08)` top shine."

### Iteration Guide
1. Check background is `#050507` — not pure black, not dark purple. The cool undertone is essential.
2. Verify glass panels use `rgba(0,0,0,0.50)` background — never `rgba(15,12,25,...)` or any purple tint.
3. Confirm all text is at minimum 12px size and 0.50 opacity — scan for any 10px/11px or 0.30/0.40 opacity values.
4. Ensure glass panels have all three shadow layers: inset top bright, inset bottom dark, outer drop.
5. Check that `::before` specular highlight exists on glass panels — without it, panels look flat.
6. Verify easing is `cubic-bezier(0.16, 1, 0.3, 1)` everywhere — no `ease`, no `linear`.
7. Confirm animations use only `opacity` and `transform` — never `width`, `height`, `padding`, `background-color`.
8. Accent purple appears only on interactive/status elements — if a decorative element is purple, it's wrong.
