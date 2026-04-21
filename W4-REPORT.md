# NextFrame v0.2 W-4 Report

## Scope

- Implemented `frontend/nf-components` as zero-framework Web Components.
- Registered 8 custom elements: `nf-topbar`, `nf-clips`, `nf-log`, `nf-timeline`, `nf-track`, `nf-clip`, `nf-anchor`, `nf-inspector`.
- Added `mock.json`, `shell.css`, `index.html`, `NfBase`, storage/events helpers, and Playwright pixel test harness.
- No Rust scope touched. No git commit made.

## File Line Counts

| File | Lines |
|---|---:|
| `src/_base.ts` | 38 |
| `src/storage.ts` | 154 |
| `src/events.ts` | 44 |
| `src/index.ts` | 68 |
| `src/components/topbar.ts` | 251 |
| `src/components/clips.ts` | 135 |
| `src/components/log.ts` | 164 |
| `src/components/timeline.ts` | 186 |
| `src/components/track.ts` | 74 |
| `src/components/clip.ts` | 128 |
| `src/components/anchor.ts` | 66 |
| `src/components/inspector.ts` | 221 |
| `index.html` | 65 |
| `mock.json` | 56 |
| `shell.css` | 383 |
| `test-w4.mjs` | 126 |

## Verification

| Command | Result |
|---|---|
| `npm install` | Pass; dependencies installed |
| `npm run build` | Pass; esbuild produced `dist/index.js` (`43.7kb`) |
| `npx tsc --noEmit` | Pass; zero TypeScript errors |
| `npm test` | Pass; DOM/custom element checks, `nf-track` host color checks, visual pixel diff |

Playwright visual result:

```text
W4 playwright checks passed; pixel diff 0.511%
```

## Notes / Pitfalls

- `NfBase` uses shared `CSSStyleSheet` instances via `adoptedStyleSheets`, with the required per-shadow reset for box sizing and square corners.
- `tokens.css` is linked and preloaded from `index.html`; shadow DOM components rely on inherited `:root` CSS variables.
- The golden timeline anchors use `left: calc(100px + pct)` because the first 100px is the track header column. Matching that offset was required to get below 1% diff.
- The prototype's audio clip is shorter than the row because `.clip.audio` changes positioning behavior; `nf-clip` mirrors this with an audio height override.
- Tiny transition clips need a `14px` minimum width to match Chromium's computed rendering from `editor-v0.1.html`.

## Artifacts

- Built bundle: `frontend/nf-components/dist/index.js`
- Visual screenshots generated during test: `frontend/nf-components/tmp-w4/app.png`, `frontend/nf-components/tmp-w4/ref.png`
