// nextframe ascii <timeline.json> <t> [--width N] [--height N]
// Renders one frame to PNG in memory, then converts to ASCII art for cheap AI "vision".
import { parseFlags, loadTimeline, emit, parseTime } from "./_io.js";
import { resolveTimeline, timelineUsage } from "./_resolve.js";
import { renderFramePNG } from "../targets/napi-canvas.js";
import { pngToAscii } from "../views/ascii.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const usage = timelineUsage("ascii", " <t> [--width 80] [--height 24]");
  const resolved = resolveTimeline(positional, { usage });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }
  const [tSpec] = resolved.rest;
  if (tSpec === undefined) {
    emit({ ok: false, error: { code: "USAGE", message: usage } }, flags);
    return 3;
  }
  const t = parseTime(tSpec);
  if (!Number.isFinite(t)) {
    emit({ ok: false, error: { code: "BAD_TIME", message: `cannot parse time "${tSpec}"` } }, flags);
    return 3;
  }
  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const width = flags.width ? Number(flags.width) : 80;
  const height = flags.height ? Number(flags.height) : 24;
  const r = renderFramePNG(loaded.value, t, { width: 640, height: 360 });
  if (!r.ok) {
    emit(r, flags);
    return 2;
  }
  const ascii = await pngToAscii(r.value, width, height);
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: { t, width, height, ascii } }, null, 2) + "\n");
  } else {
    process.stdout.write(ascii + "\n");
  }
  return 0;
}
