// Parses pipeline command flags and formats tabular pipeline command output.
export function parseIntegerFlag(name, raw, options = {}) {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return invalidFlag(name, raw, "must be an integer");
  }
  if (options.min !== undefined && value < options.min) {
    return invalidFlag(name, raw, `must be >= ${options.min}`);
  }
  return { ok: true, value };
}

export function parseNumberFlag(name, raw, options = {}) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return invalidFlag(name, raw, "must be a number");
  }
  if (options.min !== undefined && value < options.min) {
    return invalidFlag(name, raw, `must be >= ${options.min}`);
  }
  return { ok: true, value };
}

export function parseJsonFlag(name, raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return invalidFlag(name, raw, err.message);
  }
}

export function formatTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length))
  );
  const lines = [
    headers.map((header, index) => header.padEnd(widths[index])).join("  "),
    ...rows.map((row) => row.map((cell, index) => String(cell ?? "").padEnd(widths[index])).join("  ")),
  ];
  return lines.join("\n");
}

export function objectOr(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function invalidFlag(name, raw, detail) {
  return {
    ok: false,
    error: {
      code: "INVALID_FLAG",
      message: `invalid --${name}=${raw}: ${detail}`,
    },
  };
}
