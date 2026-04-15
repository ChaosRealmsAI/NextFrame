// Shared CLI I/O helpers.

import { readFile, writeFile } from "node:fs/promises";
import { defaultFixSuggestion } from "./help/index.js";

export function parseFlags(argv: any) {
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

export async function loadTimeline(path: any) {
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

export async function saveTimeline(path: any, timeline: any) {
  try {
    await writeFile(path, JSON.stringify(timeline, null, 2) + "\n");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "SAVE_FAIL", message: err.message } };
  }
}

export function emit(result: any, flags: any) {
  const normalized = normalizeResult(result);
  if (flags.json) {
    process.stdout.write(JSON.stringify(normalized, null, 2) + "\n");
    return;
  }
  if (normalized.ok) {
    if (typeof normalized.value === "string") {
      process.stdout.write(normalized.value);
      if (!normalized.value.endsWith("\n")) process.stdout.write("\n");
    } else if (normalized.value !== undefined) {
      process.stdout.write(JSON.stringify(normalized.value, null, 2) + "\n");
    } else if (normalized.message) {
      process.stdout.write(normalized.message + "\n");
    }
  } else {
    process.stderr.write(`error: ${normalized.error?.message || "unknown error"}\n`);
    process.stderr.write(`Fix: ${normalized.error?.fix}\n`);
  }
}

function normalizeResult(result: any) {
  if (!result || result.ok || !result.error) return result;
  const fix = result.error.fix || result.error.hint || defaultFixSuggestion();
  return {
    ...result,
    error: {
      ...result.error,
      fix,
    },
  };
}

export function parseTime(spec: any) {
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
