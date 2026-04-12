// nextframe render <timeline.json> <out.mp4>
import { parseFlags, loadTimeline, emit } from "./_io.js";
import { exportMP4 } from "../targets/ffmpeg-mp4.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [path, outPath] = positional;
  if (!path || !outPath) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe render <timeline> <out.mp4>" } }, flags);
    return 3;
  }
  const loaded = await loadTimeline(path);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const opts = {};
  if (flags.fps) opts.fps = Number(flags.fps);
  opts.onProgress = (i, total) => {
    if (!flags.quiet) {
      process.stderr.write(`  rendered ${i}/${total} frames\r`);
    }
  };
  const start = Date.now();
  const r = await exportMP4(loaded.value, outPath, opts);
  if (!flags.quiet) process.stderr.write("\n");
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  if (!r.ok) {
    emit(r, flags);
    return 2;
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: { ...r.value, elapsedSeconds: Number(elapsed) } }, null, 2) + "\n");
  } else {
    process.stdout.write(`wrote ${outPath} (${r.value.framesRendered} frames @ ${r.value.fps}fps, ${elapsed}s)\n`);
  }
  return 0;
}
