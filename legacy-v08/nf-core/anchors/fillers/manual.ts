import type { AnchorEntry, AnchorValue } from "../types.js";

function fail(message: string): never {
  throw new Error(`BAD_MANUAL_ANCHOR: ${message}`);
}

function clean(value: AnchorValue | undefined, field: "at" | "begin" | "end") {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`field "${field}" must be a finite number >= 0`);
  }
  return value;
}

export default function manualFiller(spec: { at?: number; begin?: number; end?: number }): AnchorEntry {
  const entry: AnchorEntry = {};

  if (spec.at !== undefined) entry.at = clean(spec.at, "at");
  if (spec.begin !== undefined) entry.begin = clean(spec.begin, "begin");
  if (spec.end !== undefined) entry.end = clean(spec.end, "end");
  if (Object.keys(entry).length === 0) {
    fail("at least one of at/begin/end is required");
  }

  return entry;
}
