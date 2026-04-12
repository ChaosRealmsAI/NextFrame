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
  "app-eval": () => import("../src/cli/app-eval.js"),
  "app-screenshot": () => import("../src/cli/app-screenshot.js"),
  "debug-screenshot": () => import("../src/cli/debug-screenshot.js"),
  "debug-log": () => import("../src/cli/debug-log.js"),
  guide: () => import("../src/cli/guide.js"),
  help: null,
};

const HELP = `nextframe — frame-pure CLI video editor for AI

USAGE
  nextframe <command> <project> <episode> <segment> [args]
  nextframe <command> <timeline.json> [args]     (legacy)

SUBCOMMANDS
  new <out.json>                              create empty timeline
  validate <project> <episode> <segment>      run safety gates
  frame <project> <episode> <segment> <t>     render single frame
  render <project> <episode> <segment>        export full timeline to mp4
  probe <out.mp4>                             inspect export metadata with ffprobe
  bake-html <project> <episode> <segment>     pre-render htmlSlide clips into PNG cache
  describe <project> <episode> <segment> <t>  JSON of what is visible at t
  ascii <project> <episode> <segment> <t>     ASCII art preview of a frame
  gantt <project> <episode> <segment>         ASCII gantt
  bake-video <project> <episode> <segment>    pre-extract videoClip frames with ffmpeg
  scenes                                      list all scenes with META
  bake-browser <project> <episode> <segment>  bake html/svg/markdown/lottie browser scenes
  add-clip <project> <episode> <segment> ...  add a clip to a track
  move-clip <project> <episode> <segment> ... move a clip's start time
  resize-clip <project> <episode> <segment>   resize clip duration
  remove-clip <project> <episode> <segment>   remove a clip
  set-param <project> <episode> <segment> ... update clip params
  add-marker <project> <episode> <segment>    append a timeline marker
  list-clips <project> <episode> <segment>    list clips grouped by track
  dup-clip <project> <episode> <segment> ...  duplicate a clip at a new time
  import-image <project> <episode> <segment>  add an image asset to timeline.assets[]
  import-audio <project> <episode> <segment>  add an audio asset to timeline.assets[]
  list-assets <project> <episode> <segment>   list assets grouped by kind
  remove-asset <project> <episode> <segment>  remove an asset by id
  guide                                       AI onboarding: conventions, workflow, naming

PROJECT MANAGEMENT
  project-new <name>                          create a project folder under ~/NextFrame/projects
  project-list [--root=PATH] [--json]        list projects with episode counts
  episode-new <project> <name>               create an episode inside a project
  episode-list <project> [--json]            list episodes for a project
  segment-new <project> <episode> <name>     create an empty segment timeline JSON
  segment-list <project> <episode> [--json]  list segment JSON files in an episode
  exports <project> <episode> [--json]       list recorded render exports for an episode

FLAGS
  --json     output structured JSON (for AI / scripts)
  --width    override render width
  --height   override render height
  --fps      override fps for export

EXIT CODES
  0  success
  1  warning (operation completed)
  2  error
  3  usage error
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
