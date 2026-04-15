import { emit, parseFlags, parseTime } from "../_helpers/_io.js";

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const timeline = positional[0];
  const time = parseTime(flags.time);

  if (!timeline || !Number.isFinite(time) || time < 0) {
    emit(
      { ok: false, error: { code: "USAGE", message: "usage: nextframe wysiwyg diff <timeline.json> --time=T" } },
      flags,
    );
    return 3;
  }

  emit(
    {
      ok: true,
      value: {
        status: "stub",
        mode: "v0.7-walking-skeleton",
        command: "wysiwyg diff",
        timeline,
        time,
      },
    },
    flags,
  );
  return 0;
}
