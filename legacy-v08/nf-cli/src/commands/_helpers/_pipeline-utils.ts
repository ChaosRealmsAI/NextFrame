// Parses pipeline command flags and formats tabular pipeline command output.
type FlagResult = { ok: true; value: number } | { ok: false; error: { code: string; message: string } };

export function parseIntegerFlag(name: string, raw: unknown, options: { min?: number } = {}): FlagResult {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return invalidFlag(name, raw, "must be an integer");
  }
  if (options.min !== undefined && value < options.min) {
    return invalidFlag(name, raw, `must be >= ${options.min}`);
  }
  return { ok: true, value };
}

export function parseNumberFlag(name: string, raw: unknown, options: { min?: number } = {}): FlagResult {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return invalidFlag(name, raw, "must be a number");
  }
  if (options.min !== undefined && value < options.min) {
    return invalidFlag(name, raw, `must be >= ${options.min}`);
  }
  return { ok: true, value };
}

type JsonFlagResult = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } };

export function parseJsonFlag(name: string, raw: unknown): JsonFlagResult {
  try {
    return { ok: true, value: JSON.parse(String(raw)) };
  } catch (err) {
    return invalidFlag(name, raw, (err as Error).message);
  }
}

export function formatTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header: string, index: number) =>
    Math.max(header.length, ...rows.map((row: string[]) => String(row[index] ?? "").length))
  );
  const lines = [
    headers.map((header: string, index: number) => header.padEnd(widths[index])).join("  "),
    ...rows.map((row: string[]) => row.map((cell: string, index: number) => String(cell ?? "").padEnd(widths[index])).join("  ")),
  ];
  return lines.join("\n");
}

export function objectOr(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function invalidFlag(name: unknown, raw: unknown, detail: string): { ok: false; error: { code: string; message: string } } {
  return {
    ok: false as const,
    error: {
      code: "INVALID_FLAG",
      message: `invalid --${String(name)}=${String(raw)}: ${detail}`,
    },
  };
}
