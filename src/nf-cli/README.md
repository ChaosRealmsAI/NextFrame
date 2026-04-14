# nextframe-cli v0.1.0

> Frame-pure CLI video editor for AI. 7 scene types, 33 scenes, 79 tests.
> `(timeline.json, t) → pixels → mp4`

## Quick start

```bash
cd src/cli

# Render the showcase — 6 scene types in 18s
node bin/nextframe.js bake-html examples/showcase/timeline.json
node bin/nextframe.js bake-browser examples/showcase/timeline.json
node bin/nextframe.js bake-video examples/showcase/timeline.json
node bin/nextframe.js render examples/showcase/timeline.json /tmp/showcase.mp4
open /tmp/showcase.mp4

# Or render the minimal demo (no bake needed — canvas-only)
node bin/nextframe.js render examples/minimal.timeline.json /tmp/minimal.mp4

# HTML preview with live scrubber
node preview/server.mjs &
open http://localhost:5173
```

## Subcommands

```
CORE
  new <out.json>                             create an empty timeline
  validate <timeline.json>                   run 6 safety gates
  frame <timeline.json> <t> <out.png>        render a single frame
  render <timeline.json> <out.mp4>           export full video (h264 1080p)
  describe <timeline.json> <t>               JSON metadata at time t
  gantt <timeline.json>                      ASCII timeline chart
  ascii <timeline.json> <t> [--width=N]      ASCII art preview of a frame
  scenes                                     list all scenes + META
  probe <file.mp4> [--json]                  inspect mp4 metadata

TIMELINE OPS
  add-clip <tl> --track=ID --scene=S ...     add a clip
  move-clip <tl> <clipId> --to=T             move clip start
  resize-clip <tl> <clipId> --duration=N     change clip duration
  remove-clip <tl> <clipId>                  delete a clip
  set-param <tl> <clipId> --key=value        update clip params
  add-marker <tl> --id=ID --at=T             add timeline marker
  list-clips <tl> [--json]                   list clips by track
  dup-clip <tl> <clipId> --to=T              duplicate a clip

ASSETS
  import-image <tl> <path> [--id=ID]         add image asset
  import-audio <tl> <path> [--id=ID]         add audio asset
  list-assets <tl> [--json]                  list project assets
  remove-asset <tl> <assetId>                remove asset reference

BAKE (pre-render browser/video content)
  bake-html <timeline.json>                  bake htmlSlide scenes
  bake-video <timeline.json>                 extract video frames
  bake-browser <timeline.json>               bake SVG + Markdown + Lottie

RENDER FLAGS
  --json          structured JSON output
  --audio=PATH    mux audio track into mp4
  --crf=N         h264 quality (0-51, default 20)
  --target=ID     render target (default: ffmpeg)
  --fps=N         override fps
```

Exit 0 = ok, 1 = warning, 2 = error, 3 = usage.

## Scene types

| Type | Scene | Render path | Use case |
|------|-------|-------------|----------|
| Canvas | 26 built-in scenes | napi-canvas | Gradients, particles, text, charts |
| Image | `imageHero` | napi-canvas | Ken-burns zoom and pan on still images |
| HTML | `htmlSlide` | puppeteer → PNG cache | Complex layouts, CSS, flexbox |
| SVG | `svgOverlay` | puppeteer → PNG cache | Diagrams, flowcharts, icons |
| Markdown | `markdownSlide` | md→HTML → puppeteer | Docs, code blocks, READMEs |
| Video | `videoClip` | ffmpeg frame extract | External video clips |
| Lottie | `lottieAnim` | puppeteer + lottie-web | After Effects animations |

Browser-based scenes need a bake step before render (`bake-html` / `bake-browser` / `bake-video`).

## Examples

| File | Duration | Tracks | Purpose |
|------|----------|--------|---------|
| `minimal.timeline.json` | 3s | 1 | Smoke test |
| `launch.timeline.json` | 12s | 4 | Product launch demo |
| `multitrack.timeline.json` | 10s | 6 | Multi-layer compositing |
| `showcase/timeline.json` | 18s | 4 | All 6 scene types |
| `cc-e01-slide01/timeline.json` | 72s | 6 | Chinese TTS + scenes |

## Architecture

```
bin/nextframe.js           dispatcher (25 subcommands)
src/engine/
  time.js                  symbolic time resolver
  validate.js              6 safety gates
  render.js                renderAt(timeline, t) → Canvas
  describe.js              semantic frame metadata
  fonts.js                 CJK font registration (Hiragino Sans GB)
src/scenes/                33 frame-pure scenes
  _contract.js             runtime scene contract guard
  index.js                 registry + META table
src/targets/
  napi-canvas.js           frame → PNG
  ffmpeg-mp4.js            frames → h264 MP4 + audio mux
src/cli/                   one file per subcommand group
src/ai/tools.js            12 AI tool functions (TOOLS map)
src/views/                 gantt + ASCII art
preview/                   HTML preview server + vanilla-JS UI
test/                      79 tests (node:test)
```

## Scene contract

Every scene exports `render(t, params, ctx)` + META. The registry validates at import time via `assertSceneContract`. Architecture tests enforce layer dependencies, file size caps, and forbidden tokens. See `CONTRIBUTING.md`.

## Links

- `CONTRIBUTING.md` — how to add scenes, commands, and AI tools
- `spec/architecture/` — 8 design documents
- `spec/cockpit-app/bdd/` — 7 BDD modules, 46 scenarios, 45 verified
