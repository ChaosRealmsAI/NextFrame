// nextframe gantt <timeline.json>
import { parseFlags, loadTimeline, emit } from "./_io.js";
import { resolveTimeline as resolveTimelineArg, timelineUsage } from "./_resolve.js";
import { renderGantt } from "../views/gantt.js";
import { resolveTimeline } from "../engine/time.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const resolvedArg = resolveTimelineArg(positional, { usage: timelineUsage("gantt") });
  if (!resolvedArg.ok) {
    emit(resolvedArg, flags);
    return resolvedArg.error?.code === "USAGE" ? 3 : 2;
  }
  const loaded = await loadTimeline(resolvedArg.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }
  const r = resolveTimeline(loaded.value);
  if (!r.ok) {
    emit(r, flags);
    return 2;
  }
  const ascii = renderGantt(r.value);
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: ascii }, null, 2) + "\n");
  } else {
    process.stdout.write(ascii + "\n");
  }
  return 0;
}
