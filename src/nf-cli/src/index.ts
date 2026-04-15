// Dispatches nextframe CLI subcommands and routes help and runtime errors.
import { defaultFixSuggestion, renderCommandHelp, renderRootHelp } from "./commands/_helpers/help/index.js";

const SUBCOMMANDS = {
  new: () => import("./commands/timeline/new.js"),
  validate: () => import("./commands/timeline/validate.js"),
  build: () => import("./commands/timeline/build.js"),
  scenes: () => import("./commands/render/scenes.js"),
  "bundle-scenes": () => import("./commands/render/bundle-scenes.js"),
  "scene-new": () => import("./commands/render/scene-new.js"),
  "scene-preview": () => import("./commands/render/scene-preview.js"),
  "scene-validate": () => import("./commands/render/scene-validate.js"),
  preview: () => import("./commands/render/preview.js"),
  frame: () => import("./commands/render/frame.js"),
  "describe-frame": () => import("./commands/render/describe-frame.js"),
  render: () => import("./commands/render/render.js"),
  "project-new": () => import("./commands/project/project-new.js"),
  "project-list": () => import("./commands/project/project-list.js"),
  "project-config": () => import("./commands/project/project-config.js"),
  "episode-new": () => import("./commands/project/episode-new.js"),
  "episode-list": () => import("./commands/project/episode-list.js"),
  "pipeline-get": () => import("./commands/pipeline/pipeline-get.js"),
  "script-set": () => import("./commands/pipeline/script-set.js"),
  "script-get": () => import("./commands/pipeline/script-get.js"),
  "audio-set": () => import("./commands/pipeline/audio-set.js"),
  "audio-get": () => import("./commands/pipeline/audio-get.js"),
  "audio-synth": () => import("./commands/pipeline/audio-synth.js"),
  "atom-add": () => import("./commands/pipeline/atom-add.js"),
  "atom-list": () => import("./commands/pipeline/atom-list.js"),
  "atom-remove": () => import("./commands/pipeline/atom-remove.js"),
  "output-add": () => import("./commands/pipeline/output-add.js"),
  "output-list": () => import("./commands/pipeline/output-list.js"),
  "output-publish": () => import("./commands/pipeline/output-publish.js"),
  "segment-new": () => import("./commands/project/segment-new.js"),
  "segment-list": () => import("./commands/project/segment-list.js"),
  "source-download": () => import("./commands/pipeline/source-download.js"),
  "source-transcribe": () => import("./commands/pipeline/source-transcribe.js"),
  "source-align": () => import("./commands/pipeline/source-align.js"),
  "source-cut": () => import("./commands/pipeline/source-cut.js"),
  "source-translate": () => import("./commands/pipeline/source-translate.js"),
  "source-polish": () => import("./commands/pipeline/source-polish.js"),
  "source-list": () => import("./commands/pipeline/source-list.js"),
  "source-link": () => import("./commands/pipeline/source-link.js"),
  "layer-add": () => import("./commands/timeline/layers.js"),
  "layer-move": () => import("./commands/timeline/layers.js"),
  "layer-resize": () => import("./commands/timeline/layers.js"),
  "layer-remove": () => import("./commands/timeline/layers.js"),
  "layer-set": () => import("./commands/timeline/layers.js"),
  "layer-list": () => import("./commands/timeline/layers.js"),
  app: () => import("./commands/app/app.js"),
  "app-pipeline": () => import("./commands/app/app-pipeline.js"),
  "app-eval": () => import("./commands/app/app-eval.js"),
  "app-screenshot": () => import("./commands/app/app-screenshot.js"),
  help: null,
};

export async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(renderRootHelp());
    process.exit(0);
  }

  const subcommand = argv[0];
  const loader = SUBCOMMANDS[subcommand as keyof typeof SUBCOMMANDS];
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
    const detail = (error as Error)?.stack || (error as Error)?.message || String(error);
    process.stderr.write(`failed to load or run "${subcommand}": ${detail}\n`);
    process.stderr.write(`Fix: ${defaultFixSuggestion()}\n`);
    process.exit(2);
  }
}

await main();
