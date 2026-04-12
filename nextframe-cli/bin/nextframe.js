#!/usr/bin/env node
// nextframe CLI dispatcher.
// Subcommand modules live in src/cli/*.js, loaded lazily.

const SUBCOMMANDS = {
  validate: () => import("../src/cli/validate.js"),
  frame: () => import("../src/cli/frame.js"),
  render: () => import("../src/cli/render.js"),
  probe: () => import("../src/cli/probe.js"),
  gantt: () => import("../src/cli/gantt.js"),
  describe: () => import("../src/cli/describe.js"),
  ascii: () => import("../src/cli/ascii.js"),
  "bake-browser": () => import("../src/cli/bakeBrowser.js"),
  new: () => import("../src/cli/new.js"),
  "add-clip": () => import("../src/cli/ops.js"),
  "move-clip": () => import("../src/cli/ops.js"),
  "resize-clip": () => import("../src/cli/ops.js"),
  "remove-clip": () => import("../src/cli/ops.js"),
  "set-param": () => import("../src/cli/ops.js"),
  "add-marker": () => import("../src/cli/ops.js"),
  "list-clips": () => import("../src/cli/ops.js"),
  "dup-clip": () => import("../src/cli/ops.js"),
  scenes: () => import("../src/cli/scenes.js"),
  help: null,
};

const HELP = `nextframe — frame-pure CLI video editor for AI

USAGE
  nextframe <subcommand> [args] [--json]

SUBCOMMANDS
  new <out.json>                              create empty timeline
  validate <timeline.json>                    run safety gates
  frame <timeline.json> <t> <out.png>         render single frame
  render <timeline.json> <out.mp4>            export full timeline to mp4
  probe <out.mp4>                             inspect export metadata with ffprobe
  describe <timeline.json> <t>                JSON of what is visible at t
  ascii <timeline.json> <t> [--width N]       ASCII art preview of a frame
  gantt <timeline.json>                       ASCII gantt
  scenes                                      list all scenes with META
  bake-browser <timeline.json>                bake html/svg/markdown/lottie browser scenes
  add-clip <timeline.json> ...                add a clip to a track
  move-clip <timeline.json> <clipId> ...      move a clip's start time
  resize-clip <timeline.json> <clipId> ...    resize clip duration
  remove-clip <timeline.json> <clipId>        remove a clip
  set-param <timeline.json> <clipId> ...      update clip params
  add-marker <timeline.json> ...              append a timeline marker
  list-clips <timeline.json> [--json]         list clips grouped by track
  dup-clip <timeline.json> <clipId> ...       duplicate a clip at a new time

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
