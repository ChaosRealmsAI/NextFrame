// nextframe match preview <plan> --seg <N>
import { emit, parseFlags } from "../_helpers/_io.js";

function normalizeArgs(argv: string[]) {
  const normalized: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--seg" && index + 1 < argv.length) {
      normalized.push(`--seg=${argv[index + 1]}`);
      index += 1;
      continue;
    }
    normalized.push(value);
  }
  return normalized;
}

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(normalizeArgs(argv));
  const [planPath] = positional;
  const seg = Number(flags.seg);
  if (!planPath || !Number.isInteger(seg) || seg <= 0) {
    emit(
      { ok: false, error: { code: "USAGE", message: "usage: nextframe match preview <plan> --seg <N>" } },
      flags,
    );
    return 3;
  }

  throw new Error("not implemented");
}
