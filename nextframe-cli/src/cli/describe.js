// nextframe describe <timeline.json> <t>
import { parseFlags, loadTimeline, emit, parseTime } from "./_io.js";
import { describeFrame } from "../engine/describe.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [path, tSpec] = positional;
  if (!path || tSpec === undefined) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe describe <timeline> <t>" } }, flags);
    return 3;
  }
  const t = parseTime(tSpec);
  if (!Number.isFinite(t)) {
    emit({ ok: false, error: { code: "BAD_TIME", message: `cannot parse time "${tSpec}"` } }, flags);
    return 3;
  }
  const loaded = await loadTimeline(path);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const r = describeFrame(loaded.value, t);
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  return r.ok ? 0 : 2;
}
