// Loads project metadata, resolves project roots, and updates project timestamps.
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
export function resolveRoot(flags) {
    return resolve(typeof flags.root === "string" ? flags.root : join(homedir(), "NextFrame", "projects"));
}
export async function loadJson(path) {
    return JSON.parse(await readFile(path, "utf8"));
}
export async function saveJson(path, value) {
    await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}
export async function loadProjectContext(root, projectName, episodeName) {
    const projectPath = join(root, projectName);
    const projectFile = join(projectPath, "project.json");
    const project = await loadJson(projectFile);
    const context = { root, projectName, projectPath, projectFile, project };
    if (!episodeName)
        return context;
    const episodePath = join(projectPath, episodeName);
    const episodeFile = join(episodePath, "episode.json");
    await stat(episodeFile);
    return { ...context, episodeName, episodePath, episodeFile };
}
export async function touchProject(projectFile, project) {
    const nextProject = {
        ...project,
        updated: new Date().toISOString(),
    };
    await saveJson(projectFile, nextProject);
    return nextProject;
}
