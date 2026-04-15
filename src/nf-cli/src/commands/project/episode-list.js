// Lists a project's episodes with their order, segment count, and total duration.
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseFlags, emit } from "../_helpers/_io.js";
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const [projectName] = positional;
    if (!projectName) {
        emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe episode-list <project> [--root=PATH] [--json]" } }, flags);
        return 3;
    }
    const root = resolveRoot(flags);
    const projectPath = join(root, projectName);
    const projectFile = join(projectPath, "project.json");
    try {
        await stat(projectFile);
    }
    catch {
        emit({ ok: false, error: { code: "PROJECT_NOT_FOUND", message: `project not found: ${projectPath}` } }, flags);
        return 2;
    }
    let episodes;
    try {
        episodes = await listEpisodes(projectPath);
    }
    catch (err) {
        emit({ ok: false, error: { code: "LIST_FAIL", message: err.message } }, flags);
        return 2;
    }
    if (flags.json) {
        process.stdout.write(JSON.stringify({ ok: true, episodes }, null, 2) + "\n");
    }
    else {
        process.stdout.write(renderTable(episodes) + "\n");
    }
    return 0;
}
async function listEpisodes(projectPath) {
    const entries = await readdir(projectPath, { withFileTypes: true });
    const episodes = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const path = join(projectPath, entry.name);
        const metaPath = join(path, "episode.json");
        let meta;
        try {
            meta = await loadJson(metaPath);
        }
        catch (err) {
            if (err.code === "ENOENT")
                continue;
            throw err;
        }
        const segments = await listSegments(path);
        episodes.push({
            name: meta.name || entry.name,
            path,
            order: Number.isFinite(Number(meta.order)) ? Number(meta.order) : 0,
            segments: segments.length,
            totalDuration: segments.reduce((sum, segment) => sum + segment.duration, 0),
        });
    }
    return episodes.sort(compareEpisodes);
}
async function listSegments(path) {
    const entries = await readdir(path, { withFileTypes: true });
    const segments = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "episode.json" || entry.name === "pipeline.json")
            continue;
        const segment = await loadJson(join(path, entry.name));
        segments.push({ duration: finiteOr(segment.duration, 0) });
    }
    return segments;
}
function compareEpisodes(a, b) {
    if (a.order !== b.order)
        return a.order - b.order;
    return String(a.name).localeCompare(String(b.name));
}
async function loadJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
function renderTable(episodes) {
    if (episodes.length === 0)
        return "(no episodes)";
    const headers = ["NAME", "ORDER", "SEGMENTS", "TOTAL DURATION"];
    const rows = episodes.map((episode) => [
        String(episode.name),
        String(episode.order),
        String(episode.segments),
        String(episode.totalDuration),
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
