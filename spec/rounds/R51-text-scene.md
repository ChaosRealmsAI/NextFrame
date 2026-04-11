# Task — R51: Dedicated Text scene with live inspector editing

## Goal
Add a "textOverlay" scene that renders user-provided text with configurable font, color, size, and position. Inspector lets user edit the text content live and see it update in the preview.

## Requirements

### Scene (`runtime/web/src/scenes/textOverlay.js`)
- Frame-pure function `(t, params, ctx, globalT)`:
  - Params: `{ text, fontSize, color, align, anchor, weight, letterSpacing, enterDur, holdDur }`
  - Defaults: `text="Your text here"`, `fontSize=96`, `color="#ffffff"`, `align="center"`, `anchor="center"`, `weight="800"`, `letterSpacing=-0.02`, `enterDur=0.6`, `holdDur=2.5`
  - `anchor`: one of `top-left`, `top-center`, `top-right`, `center`, `bottom-left`, `bottom-center`, `bottom-right`
  - Enter animation: slides up 40px + fades in over `enterDur`
  - Hold: stays visible for `holdDur`
  - Exit: fades out over last 0.4s
  - Uses system font stack
  - letterSpacing applied via char-by-char drawing

### Registration
- Add to `runtime/web/src/scenes/index.js`:
  - Import textOverlay
  - Add to SCENE_REGISTRY + SCENE_MANIFEST with full param schema (including text as `type: 'text'`, others numeric/color/enum)

### Inspector integration
- The existing field.js renderer should already handle text fields (R10); verify it renders a textarea for long text
- If not, extend field.js to render multi-line textarea when `type === 'text'` AND param name is `text`

## Technical Constraints
- Pure ES modules, frame-pure scene
- No new deps
- All existing tests pass
- textOverlay becomes scene #11 — verify SCENE_MANIFEST count updated

## Verification Commands
```bash
test -f runtime/web/src/scenes/textOverlay.js
grep -q 'textOverlay' runtime/web/src/scenes/index.js
node --input-type=module -e "import('./runtime/web/src/scenes/index.js').then(m => process.exit(m.SCENE_MANIFEST.length === 11 ? 0 : 1))"
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
node runtime/web/test/bdd/run.mjs
```
