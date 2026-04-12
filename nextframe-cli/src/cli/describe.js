// nextframe describe <timeline.json> <t>
import { parseFlags, loadTimeline, emit, parseTime } from "./_io.js";
import { resolveTimeline, timelineUsage } from "./_resolve.js";
import { describeFrame } from "../engine/describe.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, { usage: timelineUsage("describe", " <t>") });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }
  const [tSpec] = resolved.rest;
  if (tSpec === undefined) {
    emit({ ok: false, error: { code: "USAGE", message: timelineUsage("describe", " <t>") } }, flags);
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
  const r = describeFrame(loaded.value, t);
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  return r.ok ? 0 : 2;
}
