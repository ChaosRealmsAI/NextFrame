import { parseFlags, loadTimeline } from "../_helpers/_io.js";
import { validateAnchors } from "../../../../nf-core/anchors/validator.js";

export async function run(argv: string[]): Promise<number> {
  const { positional, flags } = parseFlags(argv);
  const timelinePath = positional[0];
  if (!timelinePath) {
    const payload = { ok: false, errors: [{ code: "USAGE", message: "usage: nextframe anchors validate <timeline.json> [--json]" }] };
    if (flags.json) process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    else process.stderr.write("error: usage: nextframe anchors validate <timeline.json> [--json]\n");
    return 3;
  }

  const loaded = await loadTimeline(timelinePath);
  if (!loaded.ok) {
    if (flags.json) process.stdout.write(JSON.stringify({ ok: false, errors: [loaded.error] }, null, 2) + "\n");
    else process.stderr.write(`error: ${loaded.error.message}\n`);
    return 2;
  }

  const anchors = (loaded.value as { anchors?: Record<string, unknown> }).anchors || {};
  const result = validateAnchors(anchors);
  const payload = { ok: result.ok, issues: result.issues };
  if (flags.json) process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  else process.stdout.write(`ok=${result.ok} issues=${result.issues.length}\n`);
  return result.ok ? 0 : 2;
}
