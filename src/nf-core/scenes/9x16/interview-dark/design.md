# interview-dark Design Language

## Style

Dark background with gold accents. Professional, calm, suitable for interview/conversation content. Chinese-first bilingual layout.

## Color Palette

| Role | Value | Usage |
|------|-------|-------|
| Gold (accent) | #e8c47a | Titles, emphasis, progress bar, Chinese subtitle |
| Foreground | #f4efe8 | Body text, labels |
| Foreground dim | rgba(244,239,232,0.6) | English subtitle, secondary info |
| Background | #111111 | Main canvas |
| Card | rgba(255,255,255,0.05) | Panels, tag backgrounds |
| Border | rgba(232,196,122,0.2) | Separators, outlines |

## Layout Grid (1080 x 1920)

```
┌──────────────────────┐ 0px
│      padding: 80     │
│  ┌────────────────┐  │ 80px
│  │    HEADER      │  │
│  │  series + title│  │
│  │  + guest       │  │
│  └────────────────┘  │ 260px
│                       │ 276px
│  ┌────────────────┐  │
│  │    VIDEO       │  │
│  │  (538px high)  │  │
│  └────────────────┘  │ 814px
│                       │
│  ┌────────────────┐  │ ~840px
│  │   SUBTITLE     │  │
│  │  cn (gold)     │  │
│  │  en (dim)      │  │
│  └────────────────┘  │ ~1380px
│                       │
│  ┌────────────────┐  │ ~1400px
│  │    META        │  │
│  │  time + topic  │  │
│  │  + tags        │  │
│  └────────────────┘  │ ~1680px
│                       │
│  ═══════════════════  │ ~1700px  PROGRESS BAR
│                       │
│  ┌────────────────┐  │ ~1750px
│  │    BRAND       │  │
│  │  NEXTFRAME     │  │
│  └────────────────┘  │ 1920px
└──────────────────────┘
```

## Typography

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Series name | 28px | 600 | PingFang SC |
| Episode | 28px | 400 | SF Pro Display |
| Title | 60px | 700 | PingFang SC |
| Guest name | 28px | 400 | PingFang SC |
| Chinese subtitle | 42px | 700 | PingFang SC |
| English subtitle | 22px | 400 italic | SF Pro Display |
| Meta label | 20px | 500 | PingFang SC |
| Tags | 22px | 400 | SF Pro Display |
| Brand | 32px | 300 | SF Pro Display (letter-spacing: 8px) |

## Rules

- Gold (#e8c47a) for: titles, Chinese subtitles, progress knob, separator lines
- White (#f4efe8) for: guest name, meta labels, tags
- Dim white for: English subtitles, secondary info
- Background MUST be #111111, never pure black (#000000)
- All values from tokens.js — zero hardcoded hex in index.js
- Video area: x=80, y=276, w=920, h=538 (videoOverlay percentages: x=7.4074%, y=14.375%, w=85.1852%, h=28.0208%)
- Padding: 80px from edges on both sides
- Content width: 920px (1080 - 2*80)

## Do NOT

- Use white for titles (too harsh on dark background)
- Use pure black background (use #111111)
- Swap Chinese/English subtitle colors (Chinese = gold, English = dim)
- Hardcode any hex value in component code
- Use font sizes smaller than 20px (unreadable at 1080p)
