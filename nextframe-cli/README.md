# nextframe-cli

> Frame-pure CLI video editor for AI. No GUI. No framework. Just `(timeline.json, t) → pixels`.

## Quick start

```bash
cd /Users/Zhuanz/bigbang/NextFrame/nextframe-cli

# 1) render the launch demo directly
node bin/nextframe.js render examples/launch.timeline.json /tmp/launch.mp4
open /tmp/launch.mp4

# 2) OR open the HTML preview — scrubber + live frame + export button
node preview/server.mjs &
open http://localhost:5173
```

## Subcommands

```
nextframe new <out.json>                     create an empty timeline
nextframe validate <timeline.json>           run 6 safety gates
nextframe frame <timeline.json> <t> <png>    render a single frame (≈300ms, 960x540)
nextframe render <timeline.json> <mp4>       export full video (h264 1920x1080)
nextframe describe <timeline.json> <t>       JSON metadata of what is visible at t
nextframe gantt <timeline.json>              ASCII timeline chart
nextframe scenes                             list all 21 scenes + META
nextframe add-clip <...>                     mutate timeline JSON
```

All commands accept `--json` for structured output. Exit 0 = ok, 1 = warning, 2 = error.

## Examples

- `examples/minimal.timeline.json` — 3s single-track smoke test
- `examples/launch.timeline.json` — 12s 4-track product launch demo

Rendering the launch demo takes ~80 seconds on M-series Mac (napi-canvas CPU path), producing a 1920x1080 h264 mp4 around 2.7MB.

## HTML preview

`preview/server.mjs` is a dependency-free Node HTTP server on port 5173. It
exposes:

| Route | What |
|---|---|
| `GET /` | preview.html UI |
| `GET /api/timeline?path=...` | load timeline JSON + run validator |
| `POST /api/timeline?path=...` | save timeline (body `{timeline}`) |
| `GET /api/frame?path=...&t=...&w=960` | render single PNG |
| `GET /api/gantt?path=...` | ASCII timeline |
| `POST /api/render {path, out?}` | render full MP4 |
| `GET /api/mp4?path=...` | serve an MP4 file |
| `POST /api/ai {path, prompt}` | kick off sonnet subprocess to edit the timeline |
| `GET /api/ai-status?id=...` | poll sonnet job status/logs |

The UI has:
- Scrubber that refetches the frame PNG live
- Clip list + inspector (edit start/dur/params, auto-saves)
- Gantt panel
- Validation status
- **AI Director panel** — type natural-language instructions, sonnet edits the timeline

## AI Director

Click the AI Director textarea, type something like `"change the theme to
cyberpunk, use pixelRain instead of fluidBackground, make text red"`, hit
"Ask sonnet to edit". The server spawns `claude -p --model sonnet` with a
constrained system prompt and lets it run CLI commands. Poll stops when
sonnet prints `DONE`.

Sonnet cannot touch `src/` — only the timeline JSON. Safety is enforced by
the system prompt + the server's restricted route set.

## Architecture

```
bin/nextframe.js           dispatcher
src/engine/
  time.js                  symbolic time resolver (cycle detection, 0.1s quantize)
  validate.js              6 safety gates
  render.js                renderAt(timeline, t) → Canvas
  describe.js              describe(timeline, t) → JSON
src/scenes/                21 frame-pure scenes, each with render + describe + META
src/targets/
  napi-canvas.js           single frame → PNG
  ffmpeg-mp4.js            frame stream → h264 MP4
src/cli/                   one file per subcommand
src/views/
  gantt.js                 ASCII gantt chart
  ascii.js                 PNG → ASCII art (95% "vision" substitute for AI)
src/ai/tools.js            7 AI tool functions
preview/                   HTML preview server + vanilla-JS UI
examples/                  reference timelines
```

## Scene contract

Every scene in `src/scenes/*.js` exports (or is wrapped by `scenes/index.js` to expose):

```js
export function {sceneId}(t, params, ctx, globalT) { /* draw into ctx */ }
export function describe(t, params, viewport) { return { sceneId, phase, ... }; }
export const META = { id, category, duration_hint, params: [{name,type,default,range,semantic}], ai_prompt_example };
```

`META` tells AI what params exist and what they mean. `describe()` gives AI
semantic frame metadata so it understands the frame without pixels. Both
are mandatory per `spec/architecture/02-modules.md`.

## Links

- `CONTRIBUTING.md` — extension workflow and local test entrypoint
- `spec/architecture/00-principles.md` — 7 invariants
- `spec/architecture/04-interfaces.md` — full API signatures
- `spec/architecture/06-ai-loop.md` — 5-step AI rhythm
- `spec/architecture/07-roadmap.md` — v0.1 → v1.0 plan
