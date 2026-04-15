#!/usr/bin/env node
// Dispatches nextframe CLI subcommands and routes help and runtime errors.

import { defaultFixSuggestion, renderCommandHelp, renderRootHelp } from "../src/commands/_helpers/help/index.js";

const SUBCOMMANDS = {
  new: () => import("../src/commands/timeline/new.js"),
  validate: () => import("../src/commands/timeline/validate.js"),
  build: () => import("../src/commands/timeline/build.js"),
  // lint-scenes: DEPRECATED — replaced by scene-validate (ADR-008 format)
  // "lint-scenes": () => import("../src/commands/render/lint-scenes.js"),
  scenes: () => import("../src/commands/render/scenes.js"),
  "bundle-scenes": () => import("../src/commands/render/bundle-scenes.js"),
  "scene-new": () => import("../src/commands/render/scene-new.js"),
  "scene-preview": () => import("../src/commands/render/scene-preview.js"),
  "scene-validate": () => import("../src/commands/render/scene-validate.js"),
  "video-guide": () => import("../src/commands/render/video-guide.js"),
  preview: () => import("../src/commands/render/preview.js"),
  frame: () => import("../src/commands/render/frame.js"),
  "describe-frame": () => import("../src/commands/render/describe-frame.js"),
  render: () => import("../src/commands/render/render.js"),
  "project-new": () => import("../src/commands/project/project-new.js"),
  "project-list": () => import("../src/commands/project/project-list.js"),
  "project-config": () => import("../src/commands/project/project-config.js"),
  "episode-new": () => import("../src/commands/project/episode-new.js"),
  "episode-list": () => import("../src/commands/project/episode-list.js"),
  design: () => import("../src/commands/pipeline/design.js"),
  "pipeline-get": () => import("../src/commands/pipeline/pipeline-get.js"),
  "script-set": () => import("../src/commands/pipeline/script-set.js"),
  "script-get": () => import("../src/commands/pipeline/script-get.js"),
  "audio-set": () => import("../src/commands/pipeline/audio-set.js"),
  "audio-get": () => import("../src/commands/pipeline/audio-get.js"),
  "audio-synth": () => import("../src/commands/pipeline/audio-synth.js"),
  "atom-add": () => import("../src/commands/pipeline/atom-add.js"),
  "atom-list": () => import("../src/commands/pipeline/atom-list.js"),
  "atom-remove": () => import("../src/commands/pipeline/atom-remove.js"),
  "output-add": () => import("../src/commands/pipeline/output-add.js"),
  "output-list": () => import("../src/commands/pipeline/output-list.js"),
  "output-publish": () => import("../src/commands/pipeline/output-publish.js"),
  "segment-new": () => import("../src/commands/project/segment-new.js"),
  "segment-list": () => import("../src/commands/project/segment-list.js"),
  "source-download": () => import("../src/commands/pipeline/source-download.js"),
  "source-transcribe": () => import("../src/commands/pipeline/source-transcribe.js"),
  "source-align": () => import("../src/commands/pipeline/source-align.js"),
  "source-cut": () => import("../src/commands/pipeline/source-cut.js"),
  "source-translate": () => import("../src/commands/pipeline/source-translate.js"),
  "source-polish": () => import("../src/commands/pipeline/source-polish.js"),
  "source-list": () => import("../src/commands/pipeline/source-list.js"),
  "source-link": () => import("../src/commands/pipeline/source-link.js"),
  "layer-add": () => import("../src/commands/timeline/layers.js"),
  "layer-move": () => import("../src/commands/timeline/layers.js"),
  "layer-resize": () => import("../src/commands/timeline/layers.js"),
  "layer-remove": () => import("../src/commands/timeline/layers.js"),
  "layer-set": () => import("../src/commands/timeline/layers.js"),
  "layer-list": () => import("../src/commands/timeline/layers.js"),
  app: () => import("../src/commands/app/app.js"),
  "app-pipeline": () => import("../src/commands/app/app-pipeline.js"),
  "app-eval": () => import("../src/commands/app/app-eval.js"),
  "app-screenshot": () => import("../src/commands/app/app-screenshot.js"),
  // serve: not yet wired — needs project context param
  // serve: () => import("../src/commands/render/serve.js"),
  help: null,
};

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(renderRootHelp());
    process.exit(0);
  }

  const subcommand = argv[0];
  const loader = SUBCOMMANDS[subcommand];
  if (!loader) {
    process.stderr.write(`failed to run command: unknown subcommand "${subcommand}"\n`);
    process.stderr.write('Fix: run "nextframe --help" to see every available command\n');
    process.exit(3);
  }
  if (argv[1] === "--help" || argv[1] === "-h") {
    const help = renderCommandHelp(subcommand);
    if (help) {
      process.stdout.write(help);
      process.exit(0);
    }
  }

  try {
    const mod = await loader();
    const code = await mod.run(argv.slice(1), { subcommand });
    process.exit(typeof code === "number" ? code : 0);
  } catch (error) {
    const detail = error?.stack || error?.message || String(error);
    process.stderr.write(`failed to load or run "${subcommand}": ${detail}\n`);
    process.stderr.write(`Fix: ${defaultFixSuggestion()}\n`);
    process.exit(2);
  }
}

main();
