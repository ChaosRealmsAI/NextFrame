// Lists segment timeline files for an episode with their durations.
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseFlags, emit } from "../_helpers/_io.js";
export async function run(argv) {
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
    }
    catch {
        emit({ ok: false, error: { code: "EPISODE_NOT_FOUND", message: `episode not found: ${episodePath}` } }, flags);
        return 2;
    }
    let segments;
    try {
        segments = await listSegments(episodePath);
    }
    catch (err) {
        emit({ ok: false, error: { code: "LIST_FAIL", message: err.message } }, flags);
        return 2;
    }
    if (flags.json) {
        process.stdout.write(JSON.stringify({ ok: true, segments }, null, 2) + "\n");
    }
    else {
        process.stdout.write(renderTable(segments) + "\n");
    }
    return 0;
}
async function listSegments(episodePath) {
    const entries = await readdir(episodePath, { withFileTypes: true });
    const segments = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "episode.json" || entry.name === "pipeline.json")
            continue;
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
async function loadJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
function renderTable(segments) {
    if (segments.length === 0)
        return "(no segments)";
    const headers = ["NAME", "PATH", "DURATION"];
    const rows = segments.map((segment) => [
        String(segment.name),
        String(segment.path),
        String(segment.duration),
    ]);
    return formatTable(headers, rows);
}
function formatTable(headers, rows) {
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length)));
    const lines = [
        headers.map((header, index) => header.padEnd(widths[index])).join("  "),
        ...rows.map((row) => row.map((cell, index) => String(cell ?? "").padEnd(widths[index])).join("  ")),
    ];
    return lines.join("\n");
}
function finiteOr(raw, fallback) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}
function resolveRoot(flags) {
    return resolve(typeof flags.root === "string" ? flags.root : join(homedir(), "NextFrame", "projects"));
}
