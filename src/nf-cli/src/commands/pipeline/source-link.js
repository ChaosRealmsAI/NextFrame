import { join, resolve } from "node:path";

import { loadPipeline, savePipeline } from "../_helpers/_pipeline.js";
import { loadProjectContext, resolveRoot } from "../_helpers/_project.js";
import { fail, parseSourceFlags, readSourceJson, success } from "../_helpers/_source.js";

const HELP = "usage: nextframe source-link <source-dir> --project <name> --episode <name> [--root <path>]";

export async function run(argv) {
  const { positional, flags } = parseSourceFlags(argv, ["project", "episode", "root"]);
  const [sourceDirArg] = positional;
  if (!sourceDirArg || !flags.project || !flags.episode) {
    fail("USAGE", HELP);
  }

  const sourceDir = resolve(sourceDirArg);
  const root = resolveRoot(flags);

  try {
    const source = await readSourceJson(sourceDir);
    const context = await loadProjectContext(root, String(flags.project), String(flags.episode));
    const pipeline = await loadPipeline(context.projectPath, context.episodeName);
    const nextId = pipeline.atoms.reduce((max, atom) => Math.max(max, Number(atom.id) || 0), 0) + 1;
    const sourceRef = join(sourceDir, "source.json");
    const atoms = source.clips.map((clip, index) => ({
      id: nextId + index,
      type: "video",
      name: clip.title,
      file: resolve(sourceDir, clip.file),
      duration: clip.duration_sec,
      source_ref: sourceRef,
      source_clip_id: clip.id,
      hasTl: true,
      subtitles: Array.isArray(clip.subtitles) ? clip.subtitles : [],
    }));
    const nextPipeline = await savePipeline(context.projectPath, context.episodeName, {
      ...pipeline,
      atoms: [...pipeline.atoms, ...atoms],
    });
    success({ ok: true, added: atoms.length, atoms, pipeline: nextPipeline });
    return 0;
  } catch (error) {
    fail("SOURCE_LINK_FAILED", error.message);
  }
}

export default run;
