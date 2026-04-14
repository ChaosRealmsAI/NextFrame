import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parseFlags, emit } from "./_io.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, name] = positional;
  if (!projectName || !name) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe episode-new <project> <name> [--root=PATH]" } }, flags);
    return 3;
  }

  const root = resolveRoot(flags);
  const projectPath = join(root, projectName);
  const projectFile = join(projectPath, "project.json");
  const path = join(projectPath, name);
  const episodeFile = join(path, "episode.json");

  let project;
  try {
    project = await loadJson(projectFile);
  } catch (err) {
    emit({ ok: false, error: { code: "PROJECT_NOT_FOUND", message: `project not found: ${projectPath}` } }, flags);
    return 2;
  }

  const stamp = new Date().toISOString();
  let order;
  try {
    order = await countEpisodes(projectPath) + 1;
    await mkdir(path);
    // Create pipeline subdirectories
    await mkdir(join(path, "sources"), { recursive: true });
    await mkdir(join(path, "clips"), { recursive: true });
    await mkdir(join(path, "audio"), { recursive: true });
    await mkdir(join(path, "exports"), { recursive: true });
    await writeFile(episodeFile, JSON.stringify({ name, order, created: stamp }, null, 2) + "\n");
    // Initialize empty pipeline.json
    const emptyPipeline = {
      version: "0.4",
      script: { principles: {}, arc: [], segments: [] },
      audio: { voice: null, speed: 1, segments: [] },
      atoms: [],
      outputs: [],
    };
    await writeFile(join(path, "pipeline.json"), JSON.stringify(emptyPipeline, null, 2) + "\n");
    project.updated = stamp;
    await writeFile(projectFile, JSON.stringify(project, null, 2) + "\n");
  } catch (err) {
    if (err.code === "EEXIST") {
      emit({ ok: false, error: { code: "EPISODE_EXISTS", message: `episode already exists: ${path}` } }, flags);
      return 2;
    }
    emit({ ok: false, error: { code: "CREATE_FAIL", message: err.message } }, flags);
    return 2;
  }

  const result = { ok: true, path };
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`created ${path}\n`);
  }
  return 0;
}

async function countEpisodes(projectPath) {
  const entries = await readdir(projectPath, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await stat(join(projectPath, entry.name, "episode.json"));
      count += 1;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  return count;
}

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolveRoot(flags) {
  return resolve(flags.root || join(homedir(), "NextFrame", "projects"));
}
