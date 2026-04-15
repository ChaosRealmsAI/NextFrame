// Creates a new legacy timeline JSON file with optional seed content.
import { parseFlags, saveTimeline, emit } from "../_helpers/_io.js";

export async function run(argv: any) {
  const { positional, flags } = parseFlags(argv);
  const [outPath] = positional;
  if (!outPath) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe new <out.json> [--duration=N --fps=N --width=N --height=N]" } }, flags);
    return 3;
  }

  const timeline = flags.seed ? makeLegacySeedTimeline() : makeEmptyTimeline(flags);
  const saved = await saveTimeline(outPath, timeline);
  if (!saved.ok) {
    emit(saved, flags);
    return 2;
  }

  const result = { ok: true, output: outPath };
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`created ${outPath}\n`);
  }
  return 0;
}

function makeEmptyTimeline(flags: any) {
  const width = finiteOr(flags.width, 1920);
  const height = finiteOr(flags.height, 1080);
  return {
    version: "0.1",
    schema: "nextframe/v0.1",
    duration: finiteOr(flags.duration, 10),
    background: "#0b0b14",
    project: {
      width,
      height,
      aspectRatio: width / height,
      fps: finiteOr(flags.fps, 30),
    },
    chapters: [],
    markers: [],
    tracks: [],
    assets: [],
  };
}

function makeLegacySeedTimeline() {
  return {
    version: "0.1",
    schema: "nextframe/v0.1",
    duration: 5,
    background: "#0b0b14",
    project: {
      width: 1920,
      height: 1080,
      aspectRatio: 16 / 9,
      fps: 30,
    },
    chapters: [],
    markers: [],
    tracks: [
      {
        id: "v1",
        kind: "video",
        clips: [
          {
            id: "clip-1",
            start: 0,
            dur: 5,
            scene: "auroraGradient",
            params: {},
          },
        ],
      },
    ],
    assets: [],
  };
}

function finiteOr(raw: any, fallback: any) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
