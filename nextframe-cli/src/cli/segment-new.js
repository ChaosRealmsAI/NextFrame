import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parseFlags, emit } from "./_io.js";
import { createTimelineTemplate } from "../engine-v2/timeline.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName, name] = positional;
  if (!projectName || !episodeName || !name) {
    emit({
      ok: false,
      error: {
        code: "USAGE",
        message: "usage: nextframe segment-new <project> <episode> <name> [--root=PATH] [--duration=N --fps=N --width=N --height=N]",
      },
    }, flags);
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
  } catch {
    emit({ ok: false, error: { code: "NOT_FOUND", message: `project or episode not found: ${projectName}/${episodeName}` } }, flags);
    return 2;
  }

  const stamp = new Date().toISOString();
  try {
    const timeline = createTimelineTemplate(flags);
    await writeFile(path, JSON.stringify(timeline, null, 2) + "\n", { flag: "wx" });
    project.updated = stamp;
    await writeFile(projectFile, JSON.stringify(project, null, 2) + "\n");
  } catch (error) {
    if (error.code === "EEXIST") {
      emit({ ok: false, error: { code: "SEGMENT_EXISTS", message: `segment already exists: ${path}` } }, flags);
      return 2;
    }
    emit({ ok: false, error: { code: "CREATE_FAIL", message: error.message } }, flags);
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

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function resolveRoot(flags) {
  return resolve(flags.root || join(homedir(), "NextFrame", "projects"));
}
