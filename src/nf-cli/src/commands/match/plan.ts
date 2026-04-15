// nextframe match plan <episode> --rule <name>
import { emit, parseFlags } from "../_helpers/_io.js";

function normalizeArgs(argv: string[]) {
  const normalized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--rule" && index + 1 < argv.length) {
      normalized.push(`--rule=${argv[index + 1]}`);
      index += 1;
      continue;
    }
    normalized.push(value);
  }
  return normalized;
}

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(normalizeArgs(argv));
  const [episode] = positional;
  if (!episode || typeof flags.rule !== "string" || !String(flags.rule).trim()) {
    emit(
      { ok: false, error: { code: "USAGE", message: "usage: nextframe match plan <episode> --rule <name>" } },
      flags,
    );
    return 3;
  }

  throw new Error("not implemented");
}
