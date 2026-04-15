// Loads, normalizes, and saves pipeline.json files for project episodes.
import { readFile, writeFile } from "node:fs/promises";
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

export async function loadPipeline(projectPath: any, episodeName: any) {
  const path = join(projectPath, episodeName, "pipeline.json");
  try {
    return normalizePipeline(await loadJson(path));
  } catch (err) {
    if (err.code === "ENOENT") return emptyPipeline();
    throw err;
  }
}

export async function savePipeline(projectPath: any, episodeName: any, pipeline: any) {
  const path = join(projectPath, episodeName, "pipeline.json");
  const nextPipeline = normalizePipeline(pipeline);
  await writeFile(path, JSON.stringify(nextPipeline, null, 2) + "\n");

  const projectFile = join(projectPath, "project.json");
  const project = await loadJson(projectFile);
  await touchProject(projectFile, project);

  return nextPipeline;
}

function normalizePipeline(pipeline: any) {
  const base = emptyPipeline();
  const next = pipeline && typeof pipeline === "object" ? pipeline : {};
  return {
    ...base,
    ...next,
    script: {
      ...base.script,
      ...objectOr(next.script),
      principles: objectOr(next.script?.principles),
      arc: arrayOr(next.script?.arc),
      segments: arrayOr(next.script?.segments),
    },
    audio: {
      ...base.audio,
      ...objectOr(next.audio),
      voice: next.audio?.voice ?? base.audio.voice,
      speed: finiteOr(next.audio?.speed, base.audio.speed),
      segments: arrayOr(next.audio?.segments),
    },
    atoms: arrayOr(next.atoms),
    outputs: arrayOr(next.outputs),
  };
}

function objectOr(value: any) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOr(value: any) {
  return Array.isArray(value) ? value : [];
}

function finiteOr(raw: any, fallback: any) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
