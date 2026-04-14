// Shared CLI I/O helpers.

import { readFile, writeFile } from "node:fs/promises";

export function parseFlags(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      else flags[arg.slice(2)] = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

export async function loadTimeline(path) {
  try {
    const text = await readFile(path, "utf8");
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return {
      ok: false,
      error: { code: "LOAD_FAIL", message: `cannot load ${path}: ${err.message}` },
    };
  }
}

export async function saveTimeline(path, timeline) {
  try {
    await writeFile(path, JSON.stringify(timeline, null, 2) + "\n");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "SAVE_FAIL", message: err.message } };
  }
}

export function emit(result, flags) {
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }
  if (result.ok) {
    if (typeof result.value === "string") {
      process.stdout.write(result.value);
      if (!result.value.endsWith("\n")) process.stdout.write("\n");
    } else if (result.value !== undefined) {
      process.stdout.write(JSON.stringify(result.value, null, 2) + "\n");
    } else if (result.message) {
      process.stdout.write(result.message + "\n");
    }
  } else {
    process.stderr.write(`error: ${result.error?.message || "unknown error"}\n`);
    if (result.error?.hint) process.stderr.write(`  hint: ${result.error.hint}\n`);
  }
}

export function parseTime(spec) {
  if (typeof spec === "number") return spec;
  const trimmed = String(spec).trim();
  // mm:ss.f
  const m = trimmed.match(/^(\d+):(\d+)(?:\.(\d+))?$/);
  if (m) {
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const tenths = m[3] ? Number(`0.${m[3]}`) : 0;
    return min * 60 + sec + tenths;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return NaN;
}
