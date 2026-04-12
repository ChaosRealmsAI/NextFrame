import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { emit, parseFlags } from "./_io.js";
import { PROJECTS_ROOT } from "./_resolve.js";

const USAGE = "usage: nextframe exports <project> <episode> [--json]";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [project, episode] = positional;
  if (!project || !episode) {
    emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
    return 3;
  }

  const episodeDir = join(PROJECTS_ROOT, project, episode);
  const episodePath = join(episodeDir, "episode.json");
  const exportsPath = join(episodeDir, ".exports", "exports.json");

  try {
    await stat(episodePath);
  } catch {
    emit({ ok: false, error: { code: "EPISODE_NOT_FOUND", message: `episode not found: ${episodeDir}` } }, flags);
    return 2;
  }

  let entries = [];
  try {
    const text = await readFile(exportsPath, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      emit({ ok: false, error: { code: "EXPORTS_INVALID", message: `export log must be a JSON array: ${exportsPath}` } }, flags);
      return 2;
    }
    entries = parsed;
  } catch (err) {
    if (err.code !== "ENOENT") {
      emit({ ok: false, error: { code: "EXPORTS_READ_FAIL", message: err.message } }, flags);
      return 2;
    }
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, path: exportsPath, exports: entries }, null, 2) + "\n");
  } else {
    process.stdout.write(renderTable(entries) + "\n");
  }
  return 0;
}

function renderTable(entries) {
  if (entries.length === 0) return "(no exports)";
  const headers = ["SEGMENT", "SIZE", "TIMESTAMP", "PATH"];
  const rows = entries.map((entry) => [
    String(entry.segment || ""),
    formatBytes(entry.size),
    String(entry.timestamp || ""),
    String(entry.path || ""),
  ]);
  return formatTable(headers, rows);
}

function formatTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length))
  );
  const lines = [
    headers.map((header, index) => header.padEnd(widths[index])).join("  "),
    ...rows.map((row) => row.map((cell, index) => String(cell ?? "").padEnd(widths[index])).join("  ")),
  ];
  return lines.join("\n");
}

function formatBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / (1024 ** 2)).toFixed(1)} MB`;
  return `${(size / (1024 ** 3)).toFixed(1)} GB`;
}
