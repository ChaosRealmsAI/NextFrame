// Loads, normalizes, and saves pipeline.json files for project episodes.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadJson, touchProject } from "./_project.js";
export function emptyPipeline() {
    return {
        version: "0.4",
        script: {
            principles: {},
            arc: [],
            segments: [],
        },
        audio: {
            voice: null,
            speed: 1,
            segments: [],
        },
        atoms: [],
        outputs: [],
    };
}
export async function loadPipeline(projectPath, episodeName) {
    const path = join(projectPath, episodeName, "pipeline.json");
    try {
        return normalizePipeline(await loadJson(path));
    }
    catch (err) {
        if (err.code === "ENOENT")
            return emptyPipeline();
        throw err;
    }
}
export async function savePipeline(projectPath, episodeName, pipeline) {
    const path = join(projectPath, episodeName, "pipeline.json");
    const nextPipeline = normalizePipeline(pipeline);
    await writeFile(path, JSON.stringify(nextPipeline, null, 2) + "\n");
    const projectFile = join(projectPath, "project.json");
    const project = await loadJson(projectFile);
    await touchProject(projectFile, project);
    return nextPipeline;
}
function normalizePipeline(pipeline) {
    const base = emptyPipeline();
    const next = pipeline && typeof pipeline === "object" ? pipeline : {};
    const scriptObj = objectOr(next.script);
    const audioObj = objectOr(next.audio);
    return {
        ...base,
        ...next,
        script: {
            ...base.script,
            ...scriptObj,
            principles: objectOr(scriptObj.principles),
            arc: arrayOr(scriptObj.arc),
            segments: arrayOr(scriptObj.segments),
        },
        audio: {
            ...base.audio,
            ...audioObj,
            voice: audioObj.voice ?? base.audio.voice,
            speed: finiteOr(audioObj.speed, base.audio.speed),
            segments: arrayOr(audioObj.segments),
        },
        atoms: arrayOr(next.atoms),
        outputs: arrayOr(next.outputs),
    };
}
function objectOr(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function arrayOr(value) {
    return Array.isArray(value) ? value : [];
}
function finiteOr(raw, fallback) {
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}
