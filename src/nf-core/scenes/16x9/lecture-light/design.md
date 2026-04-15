# lecture-light Design Language

## Style

Light background with deep blue accents. Clean, educational, suitable for lectures/tutorials/explainers. Content-focused with generous whitespace.

## Color Palette

| Role | Value | Usage |
|------|-------|-------|
| Primary (deep blue) | #1a1a2e | Titles, headings |
| Body | #333333 | Body text |
| Body dim | #888888 | Secondary text, captions |
| Accent (blue) | #3b82f6 | Highlights, links, chart primary |
| Accent warm (orange) | #f59e0b | Warnings, secondary chart color |
| Background | #fafafa | Main canvas |
| Card | #ffffff | Panels, code blocks |
| Border | #e5e7eb | Separators |
| Code bg | #1e1e2e | Terminal/code block background |
| Code text | #a6e3a1 | Terminal/code text (green) |

## Layout Grid (1920 x 1080)

```
┌────────────────────────────────────────────────┐ 0px
│                  padding: 80                    │
│  ┌──────────────────────────────────────────┐  │ 80px
│  │              TITLE AREA                   │  │
│  │         headline + subtitle               │  │
│  └──────────────────────────────────────────┘  │ 200px
│                                                  │
│  ┌──────────────────────────────────────────┐  │ 220px
│  │            CONTENT AREA                   │  │
│  │   (code, charts, diagrams, text)          │  │
│  │          760px tall                       │  │
│  └──────────────────────────────────────────┘  │ 980px
│                                                  │
│  ═══════════════════════════════════════════════  │ 1000px  PROGRESS BAR
│                                                  │
│  ┌──────────────────────────────────────────┐  │ 1020px
│  │  BRAND / WATERMARK                        │  │
│  └──────────────────────────────────────────┘  │ 1080px
└────────────────────────────────────────────────┘
```

## Typography

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Title | 52px | 700 | Inter |
| Subtitle | 28px | 400 | Inter |
| Body | 24px | 400 | Inter |
| Code | 20px | 400 | SF Mono |
| Label | 18px | 500 | Inter |
| Brand | 18px | 300 | Inter |

## Rules

- Deep blue (#1a1a2e) for titles, never black
- Accent blue (#3b82f6) for interactive/highlight elements
- Background MUST be #fafafa, not pure white (#ffffff) — avoids harsh glare
- Cards use #ffffff with subtle shadow (0 2px 8px rgba(0,0,0,0.06))
- All values from tokens.js
- Padding: 80px from edges
- Content width: 1760px (1920 - 2*80)

## Do NOT

- Use dark backgrounds (this is a light theme)
- Use gold/warm accent for primary elements (use blue)
- Use font sizes smaller than 18px
- Put more than 12 lines of code in a single code block
- Hardcode any hex value in component code
