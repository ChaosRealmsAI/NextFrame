import { parseFlags, saveTimeline, emit } from "./_io.js";
import { createTimelineTemplate } from "../engine-v2/timeline.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [outPath] = positional;
  if (!outPath) {
    emit({
      ok: false,
      error: {
        code: "USAGE",
        message: "usage: nextframe new <out.json> [--duration=N --fps=N --width=N --height=N --background=#hex]",
      },
    }, flags);
    return 3;
  }

  const timeline = createTimelineTemplate(flags);
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
