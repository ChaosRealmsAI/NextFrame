// Cuts clips from a source video using a plan and saves the resulting clip metadata.
import { join, resolve } from "node:path";

import { emit } from "../_helpers/_io.js";
import { loadPipeline, savePipeline } from "../_helpers/_pipeline.js";
import { loadProjectContext, resolveRoot } from "../_helpers/_project.js";
import {
  assertSourceBinAvailable,
  buildClipsFromCut,
  ensureDirectory,
  fail,
  looksLikeSourcePath,
  parseSourceFlags,
  readJson,
  readSourceJson,
  resolveEpisodeSourceDir,
  resolveSourceBin,
  runSourceBinary,
  success,
  writeSourceJson,
} from "../_helpers/_source.js";

const LEGACY_HELP = "usage: nextframe source-cut <source-dir> --plan <plan.json> [--margin 0.2]";
const HELP = "usage: nextframe source-cut <project> <episode> [--source <name>] --plan <plan.json> [--margin 0.2] [--root=PATH] [--json]";

export async function run(argv: string[]) {
  const { positional, flags } = parseSourceFlags(argv, ["plan", "margin", "source", "root"]);
  if (looksLikeSourcePath(positional[0])) {
    return runLegacy(positional, flags);
  }
  return runProjectMode(positional, flags);
}

async function runLegacy(positional: string[], flags: Record<string, string | boolean>) {
  const [sourceDirArg] = positional;
  if (!sourceDirArg || !flags.plan) {
    fail("USAGE", LEGACY_HELP);
  }

  const sourceDir = resolve(sourceDirArg);
  const planPath = resolve(String(flags.plan));
  const margin = typeof flags.margin === "string" ? flags.margin : "0.2";
  const binPath = resolveSourceBin();
  const clipsDir = join(sourceDir, "clips");

  try {
    await assertSourceBinAvailable(binPath);
    const source = await readSourceJson(sourceDir);
    runSourceBinary([
      "cut",
      "--video",
      join(sourceDir, "source.mp4"),
      "--sentences-path",
      sourceDir,
      "--plan-path",
      planPath,
      "--margin-sec",
      String(margin),
      "--out-dir",
      clipsDir,
    ], { binPath });

    const cutReport = await readJson(join(clipsDir, "cut_report.json"));
    const sentences = await readJson(join(sourceDir, "sentences.json"));
    const clips = buildClipsFromCut(sourceDir, normalizeCutReport(cutReport, clipsDir), sentences);
    const nextSource = { ...source, clips };
    await writeSourceJson(sourceDir, nextSource);
    success({ ok: true, source_dir: sourceDir, clips, source: nextSource });
    return 0;
  } catch (error: unknown) {
    fail("SOURCE_CUT_FAILED", (error as Error).message);
  }
}

async function runProjectMode(positional: string[], flags: Record<string, string | boolean>) {
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName || !flags.plan) {
    emit({ ok: false, error: { code: "USAGE", message: HELP } }, flags);
    return 3;
  }

  const planPath = resolve(String(flags.plan));
  const margin = typeof flags.margin === "string" ? flags.margin : "0.2";
  const root = resolveRoot(flags);
  let context: { root: string; projectName: string; projectPath: string; projectFile: string; project: unknown; episodeName: string; episodePath: string; episodeFile: string };
  try {
    context = await loadProjectContext(root, projectName, episodeName) as typeof context;
  } catch (err: unknown) {
    emit(loadContextError(err, projectName, episodeName), flags);
    return 2;
  }

  let sourceDir;
  try {
    sourceDir = await resolveEpisodeSourceDir(context.episodePath, flags.source);
  } catch (err: unknown) {
    emit({ ok: false, error: { code: "SOURCE_NOT_FOUND", message: (err as Error).message } }, flags);
    return 2;
  }

  const clipsDir = join(context.episodePath, "clips");
  const binPath = resolveSourceBin();

  let result;
  try {
    await assertSourceBinAvailable(binPath);
    await ensureDirectory(clipsDir);

    const source = await readSourceJson(sourceDir);
    const pipeline = await loadPipeline(context.projectPath, context.episodeName);
    runSourceBinary([
      "cut",
      "--video",
      join(sourceDir, "source.mp4"),
      "--sentences-path",
      sourceDir,
      "--plan-path",
      planPath,
      "--margin-sec",
      String(margin),
      "--out-dir",
      clipsDir,
    ], { binPath });

    const cutReport = await readJson(join(clipsDir, "cut_report.json"));
    const sentences = await readJson(join(sourceDir, "sentences.json"));
    const clips = buildClipsFromCut(sourceDir, normalizeCutReport(cutReport, clipsDir), sentences);
    const nextSource = { ...source, clips };
    await writeSourceJson(sourceDir, nextSource);

    const atoms = buildAtomsFromClips(pipeline.atoms, sourceDir, clips);
    const nextPipeline = await savePipeline(context.projectPath, context.episodeName, {
      ...pipeline,
      atoms: [...pipeline.atoms, ...atoms],
    });
    result = {
      ok: true,
      source_dir: sourceDir,
      clips_dir: clipsDir,
      clips,
      source: nextSource,
      added: atoms.length,
      atoms,
      pipeline: nextPipeline,
    };
  } catch (err: unknown) {
    emit({ ok: false, error: { code: "SOURCE_CUT_FAILED", message: (err as Error).message } }, flags);
    return 2;
  }

  if (flags.json) {
    success(result);
  } else {
    process.stdout.write(`cut ${result.clips.length} clips into ${clipsDir}\n`);
  }
  return 0;
}

function normalizeCutReport(cutReport: unknown, clipsDir: string) {
  const cr = cutReport as Record<string, unknown> | unknown[] | null;
  const rows = Array.isArray(cr)
    ? cr
    : Array.isArray((cr as Record<string, unknown>)?.success)
      ? (cr as Record<string, unknown>).success as unknown[]
      : Array.isArray((cr as Record<string, unknown>)?.clips)
        ? (cr as Record<string, unknown>).clips as unknown[]
        : [];
  return rows.map((raw, index) => {
    const clip = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      ...clip,
      id: Number(clip.id) || Number(clip.clip_num) || index + 1,
      start_sec: clip.start_sec ?? clip.start,
      end_sec: clip.end_sec ?? clip.end,
      duration_sec: clip.duration_sec ?? clip.duration,
      file: resolve(clipsDir, String(clip.file ?? `clip_${String(index + 1).padStart(2, "0")}.mp4`)),
    };
  });
}

function buildAtomsFromClips(existingAtoms: Record<string, unknown>[], sourceDir: string, clips: Record<string, unknown>[]) {
  const nextId = existingAtoms.reduce((max: number, atom: Record<string, unknown>) => Math.max(max, Number(atom.id) || 0), 0) + 1;
  const sourceRef = join(sourceDir, "source.json");
  return clips.map((clip, index) => ({
    id: nextId + index,
    type: "video",
    name: clip.title,
    file: resolve(sourceDir, String(clip.file)),
    duration: clip.duration_sec,
    source_ref: sourceRef,
    source_clip_id: clip.id,
    hasTl: true,
    subtitles: Array.isArray(clip.subtitles) ? clip.subtitles : []
  }));
}

function loadContextError(err: unknown, projectName: string, episodeName: string) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    return {
      ok: false,
      error: {
        code: "EPISODE_NOT_FOUND",
        message: `project or episode not found: ${projectName}/${episodeName}`,
      },
    };
  }
  return { ok: false, error: { code: "LOAD_FAIL", message: (err as Error).message } };
}

export default run;
