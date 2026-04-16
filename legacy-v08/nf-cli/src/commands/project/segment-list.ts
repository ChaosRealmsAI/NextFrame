// Lists segment timeline files for an episode with their durations.
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parseFlags, emit } from "../_helpers/_io.js";

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe segment-list <project> <episode> [--root=PATH] [--json]" } }, flags);
    return 3;
  }

  const root = resolveRoot(flags);
  const episodePath = join(root, projectName, episodeName);
  const episodeFile = join(episodePath, "episode.json");

  try {
    await stat(episodeFile);
  } catch {
    emit({ ok: false, error: { code: "EPISODE_NOT_FOUND", message: `episode not found: ${episodePath}` } }, flags);
    return 2;
  }

  let segments;
  try {
    segments = await listSegments(episodePath);
  } catch (err: unknown) {
    emit({ ok: false, error: { code: "LIST_FAIL", message: (err as Error).message } }, flags);
    return 2;
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, segments }, null, 2) + "\n");
  } else {
    process.stdout.write(renderTable(segments) + "\n");
  }
  return 0;
}

async function listSegments(episodePath: string) {
  const entries = await readdir(episodePath, { withFileTypes: true });
  const segments = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "episode.json" || entry.name === "pipeline.json") continue;
    const path = join(episodePath, entry.name);
    const timeline = await loadJson(path);
    segments.push({
      name: entry.name.slice(0, -5),
      path,
      duration: finiteOr(timeline.duration, 0),
    });
  }
  return segments.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function loadJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

function renderTable(segments: { name: string; path: string; duration: number }[]) {
  if (segments.length === 0) return "(no segments)";
  const headers = ["NAME", "PATH", "DURATION"];
  const rows = segments.map((segment: { name: string; path: string; duration: number }) => [
    String(segment.name),
    String(segment.path),
    String(segment.duration),
  ]);
  return formatTable(headers, rows);
}

function formatTable(headers: string[], rows: string[][]) {
  const widths = headers.map((header: string, index: number) =>
    Math.max(header.length, ...rows.map((row: string[]) => String(row[index] ?? "").length))
  );
  const lines = [
    headers.map((header: string, index: number) => header.padEnd(widths[index])).join("  "),
    ...rows.map((row: string[]) => row.map((cell: string, index: number) => String(cell ?? "").padEnd(widths[index])).join("  ")),
  ];
  return lines.join("\n");
}

function finiteOr(raw: unknown, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function resolveRoot(flags: Record<string, string | boolean>) {
  return resolve(typeof flags.root === "string" ? flags.root : join(homedir(), "NextFrame", "projects"));
}
