#!/usr/bin/env node

const SUBCOMMANDS = {
  new: () => import("../src/cli/new.js"),
  validate: () => import("../src/cli/validate.js"),
  build: () => import("../src/cli/build.js"),
  scenes: () => import("../src/cli/scenes.js"),
  preview: () => import("../src/cli/preview.js"),
  frame: () => import("../src/cli/frame.js"),
  render: () => import("../src/cli/render.js"),
  "project-new": () => import("../src/cli/project-new.js"),
  "project-list": () => import("../src/cli/project-list.js"),
  "episode-new": () => import("../src/cli/episode-new.js"),
  "episode-list": () => import("../src/cli/episode-list.js"),
  "segment-new": () => import("../src/cli/segment-new.js"),
  "segment-list": () => import("../src/cli/segment-list.js"),
  "layer-add": () => import("../src/cli/layers.js"),
  "layer-move": () => import("../src/cli/layers.js"),
  "layer-resize": () => import("../src/cli/layers.js"),
  "layer-remove": () => import("../src/cli/layers.js"),
  "layer-set": () => import("../src/cli/layers.js"),
  "layer-list": () => import("../src/cli/layers.js"),
  app: () => import("../src/cli/app.js"),
  "app-eval": () => import("../src/cli/app-eval.js"),
  "app-screenshot": () => import("../src/cli/app-screenshot.js"),
  help: null,
};

const HELP = `nextframe v0.3

Commands
  new <out.json>                         create a v0.3 timeline
  validate <timeline>                    validate a v0.3 timeline
  build <timeline> [--output=out.html]   build playable HTML
  scenes [id]                            inspect available scenes
  preview <timeline> [--times=0,3,5]     capture screenshots
  frame <timeline> <t> <out.png>         render one frame
  render <timeline> <out.mp4>            render MP4

Project commands
  project-new <name> [--root=PATH]
  project-list [--root=PATH]
  episode-new <project> <name> [--root=PATH]
  episode-list <project> [--root=PATH]
  segment-new <project> <episode> <name> [--root=PATH]
  segment-list <project> <episode> [--root=PATH]

Layer commands
  layer-list <timeline>
  layer-add <timeline> <scene> --id=hero --start=0 --dur=5 [--params='{"text":"Hi"}']
  layer-move <timeline> <layerId> --start=3
  layer-resize <timeline> <layerId> --dur=6
  layer-set <timeline> <layerId> key=value ...
  layer-remove <timeline> <layerId>
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const subcommand = argv[0];
  const loader = SUBCOMMANDS[subcommand];
  if (!loader) {
    process.stderr.write(`unknown subcommand: ${subcommand}\n\n${HELP}`);
    process.exit(3);
  }

  try {
    const mod = await loader();
    const code = await mod.run(argv.slice(1), { subcommand });
    process.exit(typeof code === "number" ? code : 0);
  } catch (error) {
    process.stderr.write(`uncaught: ${error.stack || error.message}\n`);
    process.exit(2);
  }
}

main();
