// Lists projects under the configured root with episode counts and update times.
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parseFlags, emit } from "../_helpers/_io.js";

export async function run(argv: string[]) {
  const { flags } = parseFlags(argv);
  const root = resolveRoot(flags);

  let projects;
  try {
    projects = await listProjects(root);
  } catch (err: unknown) {
    emit({ ok: false, error: { code: "LIST_FAIL", message: (err as Error).message } }, flags);
    return 2;
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, projects }, null, 2) + "\n");
  } else {
    process.stdout.write(renderTable(projects) + "\n");
  }
  return 0;
}

async function listProjects(root: string) {
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    const metaPath = join(path, "project.json");
    let meta;
    try {
      meta = await loadJson(metaPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    const info = await stat(metaPath);
    projects.push({
      name: meta.name || entry.name,
      path,
      episodes: await countEpisodes(path),
      updated: meta.updated || info.mtime.toISOString(),
    });
  }
  return projects.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function countEpisodes(projectPath: string) {
  const entries = await readdir(projectPath, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await stat(join(projectPath, entry.name, "episode.json"));
      count += 1;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return count;
}

async function loadJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

function renderTable(projects: { name: string; episodes: number; updated: string }[]) {
  if (projects.length === 0) return "(no projects)";
  const headers = ["NAME", "EPISODES", "LAST UPDATED"];
  const rows = projects.map((project: { name: string; episodes: number; updated: string }) => [
    String(project.name),
    String(project.episodes),
    String(project.updated),
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

function resolveRoot(flags: Record<string, string | boolean>) {
  return resolve(typeof flags.root === "string" ? flags.root : join(homedir(), "NextFrame", "projects"));
}
