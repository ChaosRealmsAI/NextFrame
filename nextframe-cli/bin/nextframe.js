#!/usr/bin/env node
// nextframe CLI dispatcher.
// Subcommand modules live in src/cli/*.js, loaded lazily.

const SUBCOMMANDS = {
  validate: () => import("../src/cli/validate.js"),
  frame: () => import("../src/cli/frame.js"),
  render: () => import("../src/cli/render.js"),
  gantt: () => import("../src/cli/gantt.js"),
  describe: () => import("../src/cli/describe.js"),
  new: () => import("../src/cli/new.js"),
  "add-clip": () => import("../src/cli/add.js"),
  "move-clip": () => import("../src/cli/add.js"),
  "resize-clip": () => import("../src/cli/add.js"),
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
  describe <timeline.json> <t>                JSON of what is visible at t
  gantt <timeline.json>                       ASCII gantt
  scenes                                      list all scenes with META
  add-clip <timeline.json> <track> <clip-json>  add a clip
  move-clip <timeline.json> <clipId> <newStart> move a clip's start time
  resize-clip <timeline.json> <clipId> <newDur> resize clip duration

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
