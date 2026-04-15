import { emit, parseFlags } from "../_helpers/_io.js";

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const timeline = positional[0];
  const action = positional[1];
  const args = positional.slice(2);
  const layerValue = flags.layer;
  const layer = typeof layerValue === "string" ? Number(layerValue) : Number.NaN;

  if (!timeline || !action || !Number.isInteger(layer) || layer < 0) {
    emit(
      { ok: false, error: { code: "USAGE", message: "usage: nextframe wysiwyg simulate <timeline.json> --layer=N <action> [arg ...]" } },
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
        command: "wysiwyg simulate",
        timeline,
        layer,
        action,
        args,
      },
    },
    flags,
  );
  return 0;
}
