import { parseFlags, loadTimeline, emit } from "../_helpers/_io.js";

export async function run(argv: string[]): Promise<number> {
  const { positional, flags } = parseFlags(argv);
  const timelinePath = positional[0];
  if (!timelinePath) {
    emit({
      ok: false,
      error: {
        code: "USAGE",
        message: "usage: nextframe anchors list <timeline.json> [--json]",
      },
    }, flags);
    return 3;
  }

  const loaded = await loadTimeline(timelinePath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const anchors = (loaded.value as { anchors?: Record<string, unknown> }).anchors || {};
  emit({
    ok: true,
    value: {
      count: Object.keys(anchors).length,
      anchors: Object.keys(anchors).sort().map((id) => ({ id, value: anchors[id] })),
    },
  }, flags);
  return 0;
}
