// Parses pipeline command flags and formats tabular pipeline command output.
export function parseIntegerFlag(name: any, raw: any, options = {}) {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return invalidFlag(name, raw, "must be an integer");
  }
  if (options.min !== undefined && value < options.min) {
    return invalidFlag(name, raw, `must be >= ${options.min}`);
  }
  return { ok: true, value };
}

export function parseNumberFlag(name: any, raw: any, options = {}) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return invalidFlag(name, raw, "must be a number");
  }
  if (options.min !== undefined && value < options.min) {
    return invalidFlag(name, raw, `must be >= ${options.min}`);
  }
  return { ok: true, value };
}

export function parseJsonFlag(name: any, raw: any) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return invalidFlag(name, raw, err.message);
  }
}

export function formatTable(headers: any, rows: any) {
  const widths = headers.map((header: any, index: any) =>
    Math.max(header.length, ...rows.map((row: any) => String(row[index] ?? "").length))
  );
  const lines = [
    headers.map((header: any, index: any) => header.padEnd(widths[index])).join("  "),
    ...rows.map((row: any) => row.map((cell: any, index: any) => String(cell ?? "").padEnd(widths[index])).join("  ")),
  ];
  return lines.join("\n");
}

export function objectOr(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function invalidFlag(name: any, raw: any, detail: any) {
  return {
    ok: false,
    error: {
      code: "INVALID_FLAG",
      message: `invalid --${name}=${raw}: ${detail}`,
    },
  };
}
