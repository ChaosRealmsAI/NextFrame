#!/usr/bin/env node
// nextframe CLI dispatcher.
// Subcommand modules live in src/cli/*.js, loaded lazily.

const SUBCOMMANDS = {
  validate: () => import("../src/cli/validate.js"),
  frame: () => import("../src/cli/frame.js"),
  render: () => import("../src/cli/render.js"),
  probe: () => import("../src/cli/probe.js"),
  "bake-html": () => import("../src/cli/bakeHtml.js"),
  gantt: () => import("../src/cli/gantt.js"),
  describe: () => import("../src/cli/describe.js"),
  ascii: () => import("../src/cli/ascii.js"),
  "bake-browser": () => import("../src/cli/bakeBrowser.js"),
  compose: () => import("../src/cli/compose.js"),
  new: () => import("../src/cli/new.js"),
  "project-new": () => import("../src/cli/project-new.js"),
  "project-list": () => import("../src/cli/project-list.js"),
  "episode-new": () => import("../src/cli/episode-new.js"),
  "episode-list": () => import("../src/cli/episode-list.js"),
  "segment-new": () => import("../src/cli/segment-new.js"),
  "segment-list": () => import("../src/cli/segment-list.js"),
  exports: () => import("../src/cli/exports.js"),
  "bake-video": () => import("../src/cli/bakeVideo.js"),
  compose: () => import("../src/cli/compose.js"),
  "add-clip": () => import("../src/cli/ops.js"),
  "move-clip": () => import("../src/cli/ops.js"),
  "resize-clip": () => import("../src/cli/ops.js"),
  "remove-clip": () => import("../src/cli/ops.js"),
  "set-param": () => import("../src/cli/ops.js"),
  "add-marker": () => import("../src/cli/ops.js"),
  "list-clips": () => import("../src/cli/ops.js"),
  "dup-clip": () => import("../src/cli/ops.js"),
  "import-image": () => import("../src/cli/assets.js"),
  "import-audio": () => import("../src/cli/assets.js"),
  "list-assets": () => import("../src/cli/assets.js"),
  "remove-asset": () => import("../src/cli/assets.js"),
  scenes: () => import("../src/cli/scenes.js"),
  build: () => import("../src/cli/build.js"),
  preview: () => import("../src/cli/preview.js"),
  "app-eval": () => import("../src/cli/app-eval.js"),
  "app-screenshot": () => import("../src/cli/app-screenshot.js"),
  "debug-screenshot": () => import("../src/cli/debug-screenshot.js"),
  "debug-log": () => import("../src/cli/debug-log.js"),
  guide: () => import("../src/cli/guide.js"),
  help: null,
};

const HELP = `nextframe — AI-native video editor CLI (v0.3)

  Timeline JSON → multi-layer HTML → browser playback

WORKFLOW
  1. nextframe scenes                         see 48 components
  2. nextframe scenes <id>                    see component params
  3. Write timeline.json                      (see FORMAT below)
  4. nextframe validate <timeline.json>       check errors + overlap
  5. nextframe build <timeline.json> -o X     generate playable HTML
  6. nextframe preview <timeline.json>        screenshot key frames + layout check
  7. Fix issues, repeat from step 4

  No matching scene? Write one:
    runtime/web/src/scenes-v2/myScene.js      create/update/destroy format
    Add to scenes-v2/index.js                 register it

COMMANDS
  scenes                         list all 48 scene components
  scenes <id>                    show params + defaults for one scene
  validate <timeline.json>       6 safety gates + fullscreen overlap detection
  build <timeline.json> -o X     bundle timeline + scenes into single HTML
  preview <timeline.json>        headless screenshot + layout map per frame
  preview <tl> --times=2,8,15   screenshot specific times
  project-new <name>             create project in ~/NextFrame/projects/
  episode-new <proj> <name>      create episode
  segment-new <proj> <ep> <name> create segment (v0.3 layers format)

TIMELINE FORMAT
  {
    "width": 1920, "height": 1080, "fps": 30, "duration": 20,
    "background": "#05050c",
    "layers": [
      { "id": "bg", "scene": "auroraGradient", "start": 0, "dur": 20,
        "params": { "hueA": 265 } },
      { "id": "title", "scene": "headline", "start": 1, "dur": 5,
        "params": { "text": "Hello", "fontSize": 96 },
        "enter": "fadeIn 0.8s", "exit": "fadeOut 0.5s" }
    ]
  }

LAYER PROPERTIES (every property = CSS, AI writes like CSS)
  id, scene, start, dur, params   required
  x, y, w, h                     position + size (% or px)
  opacity                         0-1
  rotation                        degrees
  scale                           multiplier (1 = normal)
  blend                           normal/screen/multiply/overlay/lighten
  filter                          CSS filter (blur/grayscale/sepia)
  borderRadius                    CSS border-radius
  shadow                          CSS box-shadow
  clipPath                        CSS clip-path
  border                          CSS border
  padding                         CSS padding
  backdropFilter                  CSS backdrop-filter (e.g. blur(20px))
  transformOrigin                 CSS transform-origin
  zIndex                          explicit z-order (default = array order)
  enter                           fadeIn/slideUp/slideDown/slideLeft/slideRight/scaleIn + dur
  exit                            fadeOut/slideDown/scaleOut + dur
  transition                      dissolve/wipeLeft/wipeRight/wipeUp/wipeDown/zoomIn + dur

KEYFRAME ANIMATION (any property can animate over time)
  Static:   "opacity": 0.8
  Animated: "opacity": { "keys": [[0, 0], [1, 1], [4, 1], [5, 0]], "ease": "easeOut" }

  keys = [[time_in_seconds, value], ...]  sorted by time
  ease = "linear" | "easeIn" | "easeOut" (default)
  Works on: opacity, x, y, w, h, rotation, scale, filter, clipPath

  Examples:
    Fly in from right:  "x": { "keys": [[0, "100%"], [1.5, "10%"]] }
    Rotate 360:         "rotation": { "keys": [[0, 0], [5, 360]], "ease": "linear" }
    Scale bounce:       "scale": { "keys": [[0, 0.5], [1, 1.2], [1.5, 1]] }
    Fade in+out:        "opacity": { "keys": [[0, 0], [0.5, 1], [4, 1], [5, 0]] }

LAYOUT (same time = position with x/y/w/h, think CSS)
  fullscreen   (default)    no x/y/w/h needed
  left-half    x="0"    y="0"    w="50%"  h="100%"
  right-half   x="50%"  y="0"    w="50%"  h="100%"
  top-half     x="0"    y="0"    w="100%" h="50%"
  bottom-half  x="0"    y="50%"  w="100%" h="50%"
  center-box   x="15%"  y="15%"  w="70%"  h="70%"
  pip          x="65%"  y="5%"   w="30%"  h="30%"

  Same time, side by side:
    { "scene": "barChart",  "x":"5%", "y":"10%", "w":"45%", "h":"80%" }
    { "scene": "pieChart",  "x":"52%","y":"10%", "w":"45%", "h":"80%" }

  Background layers (aurora, shader, vignette, starfield) can overlap freely.
  Content layers at same time MUST use x/y/w/h or validate will warn.

SCENE TYPES
  dom      text, layout, cards      (localT normalized 0~1)
  canvas   2D effects, backgrounds  (localT in seconds)
  svg      charts, diagrams         (localT in seconds)
  webgl    GPU shader effects       (localT in seconds)
  media    video, image             (localT in seconds)

CREATING NEW SCENES
  export default {
    id: "myScene", type: "dom", name: "My Scene",
    category: "Typography", defaultParams: { text: "Hi" },
    create(container, params) { /* return DOM refs */ },
    update(els, localT, params) { /* animate per frame */ },
    destroy(els) { els.root.remove(); }
  };

FLAGS
  --json     structured JSON output
  -o FILE    output file path (build)
  --times=   comma-separated times (preview)

EXIT CODES  0=ok  1=warning  2=error  3=usage
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }
  const sub = argv[0];
  const loader = SUBCOMMANDS[sub];
  if (!loader) {
    process.stderr.write(`unknown subcommand: ${sub}\n\n${HELP}`);
    process.exit(3);
  }
  try {
    const mod = await loader();
    const code = await mod.run(argv.slice(1), { subcommand: sub });
    process.exit(typeof code === "number" ? code : 0);
  } catch (err) {
    process.stderr.write(`uncaught: ${err.stack || err.message}\n`);
    process.exit(2);
  }
}

main();
