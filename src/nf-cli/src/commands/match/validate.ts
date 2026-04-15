// nextframe match validate <timeline>
import { emit, parseFlags } from "../_helpers/_io.js";
import { resolveTimeline } from "../_helpers/_resolve.js";

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const resolved = resolveTimeline(positional, {
    usage: "usage: nextframe match validate <project> <episode> <segment>\n   or: nextframe match validate <timeline.json>",
  });
  if (resolved.ok === false) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  throw new Error("not implemented");
}
