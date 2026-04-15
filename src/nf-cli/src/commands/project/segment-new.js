// Creates a new empty segment timeline JSON file inside an episode.
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseFlags, emit } from "../_helpers/_io.js";
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const [projectName, episodeName, name] = positional;
    if (!projectName || !episodeName || !name) {
        emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe segment-new <project> <episode> <name> [--root=PATH] [--duration=N --fps=N]" } }, flags);
        return 3;
    }
    const root = resolveRoot(flags);
    const projectPath = join(root, projectName);
    const projectFile = join(projectPath, "project.json");
    const episodePath = join(projectPath, episodeName);
    const episodeFile = join(episodePath, "episode.json");
    const path = join(episodePath, `${name}.json`);
    let project;
    try {
        project = await loadJson(projectFile);
        await stat(episodeFile);
    }
    catch {
        emit({ ok: false, error: { code: "NOT_FOUND", message: `project or episode not found: ${projectName}/${episodeName}` } }, flags);
        return 2;
    }
    const stamp = new Date().toISOString();
    try {
        const timeline = makeEmptyTimeline(flags);
        await writeFile(path, JSON.stringify(timeline, null, 2) + "\n", { flag: "wx" });
        project.updated = stamp;
        await writeFile(projectFile, JSON.stringify(project, null, 2) + "\n");
    }
    catch (err) {
        if (err.code === "EEXIST") {
            emit({ ok: false, error: { code: "SEGMENT_EXISTS", message: `segment already exists: ${path}` } }, flags);
            return 2;
        }
        emit({ ok: false, error: { code: "CREATE_FAIL", message: err.message } }, flags);
        return 2;
    }
    const result = { ok: true, path };
    if (flags.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
    else {
        process.stdout.write(`created ${path}\n`);
    }
    return 0;
}
function makeEmptyTimeline(flags) {
    return {
        version: "0.3",
        schema: "nextframe/v0.3",
        width: finiteOr(flags.width, 1920),
        height: finiteOr(flags.height, 1080),
        fps: finiteOr(flags.fps, 30),
        duration: finiteOr(flags.duration, 10),
        background: "#05050c",
        layers: [],
    };
}
function finiteOr(raw, fallback) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}
async function loadJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
function resolveRoot(flags) {
    return resolve(typeof flags.root === "string" ? flags.root : join(homedir(), "NextFrame", "projects"));
}
