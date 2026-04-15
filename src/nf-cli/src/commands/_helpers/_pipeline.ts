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

export async function loadPipeline(projectPath: string, episodeName: string) {
  const path = join(projectPath, episodeName, "pipeline.json");
  try {
    return normalizePipeline(await loadJson(path));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyPipeline();
    throw err;
  }
}

export async function savePipeline(projectPath: string, episodeName: string, pipeline: Record<string, unknown>) {
  const path = join(projectPath, episodeName, "pipeline.json");
  const nextPipeline = normalizePipeline(pipeline);
  await writeFile(path, JSON.stringify(nextPipeline, null, 2) + "\n");

  const projectFile = join(projectPath, "project.json");
  const project = await loadJson(projectFile);
  await touchProject(projectFile, project);

  return nextPipeline;
}

function normalizePipeline(pipeline: unknown) {
  const base = emptyPipeline();
  const next = pipeline && typeof pipeline === "object" ? pipeline as Record<string, unknown> : {} as Record<string, unknown>;
  const scriptObj = objectOr(next.script) as Record<string, unknown>;
  const audioObj = objectOr(next.audio) as Record<string, unknown>;
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

function objectOr(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOr(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function finiteOr(raw: unknown, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
