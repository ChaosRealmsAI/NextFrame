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
  new: () => import("../src/cli/new.js"),
  "project-new": () => import("../src/cli/project-new.js"),
  "project-list": () => import("../src/cli/project-list.js"),
  "episode-new": () => import("../src/cli/episode-new.js"),
  "episode-list": () => import("../src/cli/episode-list.js"),
  "segment-new": () => import("../src/cli/segment-new.js"),
  "segment-list": () => import("../src/cli/segment-list.js"),
  exports: () => import("../src/cli/exports.js"),
  "bake-video": () => import("../src/cli/bakeVideo.js"),
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
  "app-eval": () => import("../src/cli/app-eval.js"),
  "app-screenshot": () => import("../src/cli/app-screenshot.js"),
  "debug-screenshot": () => import("../src/cli/debug-screenshot.js"),
  "debug-log": () => import("../src/cli/debug-log.js"),
  guide: () => import("../src/cli/guide.js"),
  help: null,
};

const HELP = `nextframe — AI-native video editor CLI (v0.3)

  Timeline JSON → multi-layer HTML → browser playback

QUICK START (for AI)
  1. nextframe scenes                           see 48 available components
  2. Write timeline.json with layers[]          (see FORMAT below)
  3. nextframe validate timeline.json           check for errors
  4. nextframe build timeline.json -o out.html  generate playable HTML
  5. open out.html                              preview in browser

  No matching scene? Write one:
    runtime/web/src/scenes-v2/myScene.js        create/update/destroy format
    Add to runtime/web/src/scenes-v2/index.js   register it

COMMANDS — v0.3 (use these)
  scenes                         list all 48 scene components (grouped by category)
  scenes <id>                    show single scene: type, params, defaults
  validate <timeline.json>       run 6 safety gates (format, scenes, time, ids)
  build <timeline.json> -o X     bundle timeline + all scenes into single HTML

TIMELINE FORMAT (v0.3 flat layers)
  {
    "width": 1920, "height": 1080, "fps": 30, "duration": 20,
    "background": "#05050c",
    "layers": [
      { "id": "bg", "scene": "auroraGradient", "start": 0, "dur": 20,
        "params": { "hueA": 265 } },
      { "id": "title", "scene": "headline", "start": 1, "dur": 5,
        "params": { "text": "Hello", "fontSize": 96 },
        "enter": "fadeIn 0.8s", "exit": "fadeOut 0.5s",
        "transition": "dissolve 0.5s" }
    ]
  }

LAYER PROPERTIES
  id, scene, start, dur, params       required
  enter       fadeIn/slideUp/slideDown/slideLeft/slideRight/scaleIn + duration
  exit        fadeOut/slideDown/scaleOut + duration
  transition  dissolve/wipeLeft/wipeRight/wipeUp/wipeDown/slideLeft/slideRight/slideUp/slideDown/zoomIn
  blend       normal/screen/lighten/multiply/overlay
  filter      CSS filter string (blur/grayscale/sepia)
  opacity     0-1
  x/y/w/h     position and size

SCENE TYPES
  dom         text, layout, cards (localT normalized 0~1)
  canvas      2D effects, backgrounds (localT in seconds)
  svg         data visualization, diagrams (localT in seconds)
  webgl       GPU shader effects (localT in seconds)
  media       video/image embed (localT in seconds)

CREATING NEW SCENES
  export default {
    id: "myScene", type: "dom", name: "My Scene",
    category: "Typography", defaultParams: { text: "Hi" },
    create(container, params) { /* return DOM refs */ },
    update(els, localT, params) { /* animate per frame */ },
    destroy(els) { els.root.remove(); }
  };

COMMANDS — legacy v0.1 (still available)
  new/validate/frame/render/probe/gantt/describe/ascii
  add-clip/move-clip/resize-clip/remove-clip/set-param
  project-new/project-list/episode-new/episode-list
  segment-new/segment-list/exports/guide

FLAGS
  --json     output structured JSON (for AI / scripts)
  -o FILE    output file path (for build)

EXIT CODES
  0 success | 1 warning | 2 error | 3 usage error
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
