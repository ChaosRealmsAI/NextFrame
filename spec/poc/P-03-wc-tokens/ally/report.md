---
agent: ally-gpt
affects_scenarios: [S-07, S-08, S-09, S-10, S-11, S-12, S-13, S-14]
status: passed
duration: 20m
---

# POC P-03 Web Components + tokens.css

## Verdict

All four Chromium/Playwright checks passed.

- tokens.css `:root` custom properties penetrate open shadow DOM through normal CSS custom property inheritance.
- Live updates on `document.documentElement.style` propagate into shadow DOM without JS plumbing.
- Main-document universal selector pollution does not penetrate shadow styles.
- `:host([kind])` works for scene/text/audio visual switching.
- `adoptedStyleSheets` is supported in the test browser. For v0.2 scale, either approach is fast; use shared `adoptedStyleSheets` for reusable component base styles, and keep product theme tokens in the document-level `tokens.css`.

## Test Results

| Test | Assertion | Result | Evidence |
| --- | --- | --- | --- |
| A | `var(--accent)` resolves inside shadow DOM, then updates live from `#a78bfa` to `#ff0000` | pass | `rgb(167, 139, 250)` then `rgb(255, 0, 0)` |
| B | `* { color: red !important }` in the document does not affect `.tab.cur` inside shadow DOM | pass | document probe `rgb(255, 0, 0)`, shadow tab `rgb(244, 244, 248)` |
| C | `:host([kind])` selects scene/text/audio variants | pass | scene `rgb(167, 139, 250)`, text `rgb(224, 183, 108)`, audio `rgb(123, 201, 181)` |
| D | 10-component render and `--accent` repaint measured for root-var style and shared constructed stylesheet | pass | adoptedStyleSheets supported: `true` |

## Performance

Measured by `performance.mark` / `performance.measure` in Chromium through Playwright. Each render sample creates 10 shadow components; value shown is the median of 12 samples with a forced style read.

| Path | Create 10 median | `--accent` repaint 10 |
| --- | ---: | ---: |
| Per-component shadow `<style>` reading `:root` vars | 0.1 ms | 0.2 ms |
| Shared `shadowRoot.adoptedStyleSheets = [sharedSheet]` | 0.1 ms | 0.2 ms |

Recommendation: keep `tokens.css` as the single document-level token source. Use `adoptedStyleSheets` for shared component structural styles when the component set grows, but do not duplicate token values inside every component. The measured v0.2 scale is comfortably below any practical UI budget.

## Artifacts

- Source: `src/index.html`, `src/tokens.css`, `src/index.ts`, `src/components/*.ts`
- Bundle: `dist/index.js`
- Browser result JSON: `dist/test-results.json`
- Screenshots:
  - `screenshots/test-a-shadow-var-live-update.png`
  - `screenshots/test-b-global-style-isolation.png`
  - `screenshots/test-c-host-kind-colors.png`
  - `screenshots/test-d-perf-adopted-vs-root.png`

## Reproduce

```bash
cd /Users/Zhuanz/bigbang/NextFrame/spec/poc/P-03-wc-tokens/ally
npm install
npm run build
npm test
```
