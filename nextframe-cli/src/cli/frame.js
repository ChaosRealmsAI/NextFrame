// nextframe frame <timeline.json> <t> <out.png>
import { writeFile } from "node:fs/promises";
import { parseFlags, loadTimeline, emit, parseTime } from "./_io.js";
import { defaultFramePath, resolveTimeline, timelineUsage } from "./_resolve.js";
import { renderFramePNG } from "../targets/napi-canvas.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, {
    usage: timelineUsage("frame", " <t> [out.png]", " <t> <out.png>"),
  });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }
  const [tSpec, explicitOutPath] = resolved.rest;
  const outPath = explicitOutPath || (!resolved.legacy && tSpec !== undefined ? defaultFramePath(resolved.jsonPath, tSpec) : null);
  if (tSpec === undefined || !outPath) {
    emit({ ok: false, error: { code: "USAGE", message: timelineUsage("frame", " <t> [out.png]", " <t> <out.png>") } }, flags);
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
  const opts = {};
  if (flags.width) opts.width = Number(flags.width);
  if (flags.height) opts.height = Number(flags.height);
  const r = renderFramePNG(loaded.value, t, opts);
  if (!r.ok) {
    emit(r, flags);
    return 2;
  }
  await writeFile(outPath, r.value);
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: { path: outPath, bytes: r.value.length, t } }, null, 2) + "\n");
  } else {
    process.stdout.write(`wrote ${outPath} (${r.value.length} bytes)\n`);
  }
  return 0;
}
