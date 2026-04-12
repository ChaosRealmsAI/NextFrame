// nextframe new <out.json>
import { parseFlags, saveTimeline, emit } from "./_io.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [outPath] = positional;
  if (!outPath) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe new <out.json>" } }, flags);
    return 3;
  }
  const timeline = {
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
  };
  const r = await saveTimeline(outPath, timeline);
  if (!r.ok) {
    emit(r, flags);
    return 2;
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: { path: outPath } }, null, 2) + "\n");
  } else {
    process.stdout.write(`created ${outPath}\n`);
  }
  return 0;
}
