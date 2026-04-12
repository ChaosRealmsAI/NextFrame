# I-hot-reload report

## Result

This POC serves a browser preview from `server.js`, imports `../auroraGradient.js`, fetches `timeline.json`, and re-renders the active clip every animation frame at `t = (Date.now() / 1000) % duration`.

## Reload latency

Measured save-to-next-preview-frame latency after editing `timeline.json` and changing `params.hueA` across all 3 clips:

- Sample 1: 156 ms
- Sample 2: 50 ms
- Sample 3: 70 ms
- Sample 4: 70 ms
- Sample 5: 38 ms
- Average: 76.8 ms
- Min / max: 38 ms / 156 ms

Measurement method: headless Chrome loaded the preview page, rewrote `timeline.json`, waited for the websocket-triggered reload, and read the page’s `window.__lastReloadLatencyMs` once the new hue was visible on the next render frame.

## Simplest reload mechanism

The simplest working path was:

1. `fs.watch(__dirname, ...)` filters for `timeline.json`
2. server sends one small websocket text message with `changedAt`
3. browser re-fetches `/timeline.json?ts=...`
4. next `requestAnimationFrame` renders with the new timeline data

This is simpler than HMR, bundlers, or diff-based patching. For this POC, full JSON re-fetch is cheap and the implementation stays small.

## Dev experience

For AI/human iteration, the loop is good. The average latency stayed well under 100 ms, which is fast enough to feel close to instant while tweaking scene params. The main reason it feels workable is that there is no compile step and no client state migration; a save becomes one watch event, one websocket ping, one JSON fetch, and the next canvas frame.

The tradeoff is that this is intentionally minimal rather than robust. `fs.watch` can coalesce or duplicate events depending on editor behavior, and the websocket implementation is only as complete as this use case needs.

## Setup

- Run: `node server.js`
- Open: `http://localhost:8765`
- No npm dependencies are required for the dev server

## LOC

- Total POC LOC: 442

## Gotchas

- In this local environment, port `8765` was already occupied by an unrelated `python -m http.server`, so validation was run with `PORT=8766 node server.js`. The code still defaults to `8765` for the requested user flow.
