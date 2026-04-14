# Task — Pixel-perfect Scene Quality for NextFrame Video Pipeline

## Goal

Rewrite all 16 NextFrame scene components (8 for 9:16 interview + 8 for 16:9 lecture) to match production-quality reference frames. The reference PNGs are the gold standard — scenes must produce output visually identical to them.

## Reference Frames (READ THESE IMAGES)

### 9:16 Interview Series (硅谷访谈)
- `/tmp/ref-interview.png` — t=0, initial frame showing all elements
- `/tmp/ref-interview-30.png` — t=30s, subtitle changed, video advanced
- `/tmp/ref-interview-90.png` — t=90s, another subtitle

### 16:9 Lecture Series (源码讲解)
- `/tmp/ref-lec-p1.png` — Phase 1: dual-pane layout (code terminal LEFT + typography RIGHT)
- `/tmp/ref-lec-p2.png` — Phase 2: code terminal full view
- `/tmp/ref-lec-p3.png` — Phase 3: flow diagram

## Design Tokens (MUST USE)

### 9:16 Interview
- Background: `#0a0a0a`
- Gold/accent: `#d4b483`
- Warm accent: `#da7756`
- Text primary: `#f5ece0`
- Text secondary: `rgba(245,236,224,0.5)`
- Text muted: `rgba(245,236,224,0.3)`

### 16:9 Lecture
- Background: `#1a1510`
- Code bg: `#1e1e2e`
- Accent: `#da7756`
- Gold: `#d4b483`
- Text primary: `#f5ece0`
- Code green: `#7ec699`
- Code comment: `#6a6a7a`

## Scene Files to Modify

All scene files are at `src/nf-core/scenes/`. Each exports: `meta`, `render(t, params, vp)`, `screenshots()`, `lint()`.

### 9:16 Interview Scenes
1. `9x16/backgrounds/interviewBg/index.js` — Deep black bg + subtle warm glow
2. `9x16/overlays/interviewHeader/index.js` — Gold series line + large white title
3. `9x16/media/interviewVideoArea/index.js` — Rounded video embed, y=220 h=600
4. `9x16/overlays/interviewBiSub/index.js` — Centered gold Chinese + gray English subtitle
5. `9x16/overlays/interviewMeta/index.js` — Metadata line + "正在看" + tags
6. `9x16/overlays/interviewBrand/index.js` — Gold brand name + tiny attribution
7. `9x16/overlays/progressBar9x16/index.js` — Thin accent progress bar at bottom
8. `9x16/overlays/interviewTopBar/index.js` — Alternative top bar (if used)

### 16:9 Lecture Scenes
1. `16x9/backgrounds/darkGradient/index.js` — Warm dark bg + accent glow
2. `16x9/typography/headlineCenter/index.js` — Centered headline with HTML support
3. `16x9/browser/codeTerminal/index.js` — Syntax-highlighted code with window chrome (●●● dots)
4. `16x9/data/flowDiagram/index.js` — Flow diagram with nodes + arrows
5. `16x9/overlays/subtitleBar/index.js` — Bottom subtitle bar with SRT timing
6. `16x9/overlays/progressBar/index.js` — Thin progress bar at very bottom
7. `16x9/overlays/slideChrome/index.js` — Top bar: brand + series + episode watermark
8. `16x9/media/videoClip/index.js` — Embedded video clip

## Specific Visual Requirements (from reference analysis)

### interviewHeader
- Series line: "速通硅谷访谈 · E01 · Dario Amodei" — 16px gold #d4b483, 600 weight, centered, y≈60
- Title: "指数快到头了，大众浑然不知" — 36px #f5ece0, 800 weight, centered, y≈110, max 2 lines
- Letter-spacing: -0.01em for title (tight)

### interviewVideoArea
- Position: y=220, height=600 at 1080x1920 viewport
- Left/right padding: 40px (at 1080w)
- Border-radius: 12px
- Video element must have `muted playsinline preload="auto"`
- Use `data-nf-persist` for video element survival during compose

### interviewBiSub
- Chinese text: CENTERED, gold #d4b483, 28px (at 1080w), 700 weight
- English text: CENTERED, rgba(245,236,224,0.6), 14px, 400 weight
- NO accent line, NO background
- Fade in with ease-out-cubic, subtle translateY

### codeTerminal (CRITICAL — reference shows window chrome)
- Must have window control dots: red/yellow/green circles at top-left
- Title bar with filename
- Dark code background #1e1e2e
- Syntax highlighting: comments gray, strings green, keywords orange, numbers gold
- Staggered line entrance animation
- Reference shows code on LEFT side (about 55% width) — but this is controlled by timeline params, not the scene

### slideChrome
- Top bar height: ~50px
- Left: "OPC · 王宇轩" in small text
- Center: series title in accent color
- Right: episode info
- Large "E01" watermark top-right corner, semi-transparent, ~120px font

### flowDiagram
- Nodes with rounded corners, border in accent color
- Arrows with gold color
- "PASS ✓" node in green, "BLOCK ✗" in red
- Staggered entrance animation

## Technical Constraints

- Each scene file must be ≤ 500 lines
- No `var` (use `const`/`let`)
- No `console.log`
- No TODO/FIXME/HACK
- All render functions are pure: `(t, params, vp) → HTML string`
- `t` is local time within the layer (starts at 0)
- `vp` has `{ width, height }` — always use proportional math: `Math.round(vp.width * N / 1080)`
- Escape user content with esc() helper
- All scenes must export: meta, render, screenshots, lint

## Verification Commands

```bash
cd /Users/Zhuanz/bigbang/NextFrame/.worktrees/v04-scene-quality-2c69e61f

# Check no var/console.log/TODO
grep -r 'var ' src/nf-core/scenes/ --include="*.js" | grep -v node_modules | grep -v '// ' && echo "FAIL: var found" && exit 1 || true
grep -r 'console.log' src/nf-core/scenes/ --include="*.js" | grep -v node_modules && echo "FAIL: console.log found" && exit 1 || true
grep -rE 'TODO|FIXME|HACK|XXX' src/nf-core/scenes/ --include="*.js" | grep -v node_modules && echo "FAIL: TODO found" && exit 1 || true

# Validate scenes load
node src/nf-cli/bin/nextframe.js scenes 2>&1 | head -5

# Build interview timeline
node src/nf-cli/bin/nextframe.js build /tmp/interview-real.json --out /tmp/ally-interview.html 2>&1

# Build lecture timeline
node src/nf-cli/bin/nextframe.js build /tmp/lecture-ref.json --out /tmp/ally-lecture.html 2>&1

# Preview interview at 3 key times
node src/nf-cli/bin/nextframe.js preview /tmp/interview-real.json --times=2,8,15 --out=/tmp/ally-frames 2>&1

# Preview lecture at 3 key times
node src/nf-cli/bin/nextframe.js preview /tmp/lecture-ref.json --times=2,12,22 --out=/tmp/ally-frames 2>&1

echo "ALL VERIFICATION PASSED"
```

## Timeline JSON Files (for testing)

- Interview: `/tmp/interview-real.json` (9:16, 1080x1920, 20s)
- Lecture: `/tmp/lecture-ref.json` (16:9, 1920x1080, 30s)

Read these to understand the params each scene receives.
