// Downloads a source video into the library and initializes its source.json metadata.
import { join } from "node:path";

import { emit } from "../_helpers/_io.js";
import { loadProjectContext, resolveRoot } from "../_helpers/_project.js";
import {
  assertSourceBinAvailable,
  createSourceDocument,
  ensureDirectory,
  fail,
  finalizeDownloadDirectory,
  looksLikeSourcePath,
  normalizeFormat,
  parseSourceFlags,
  pickMetaDuration,
  pickMetaTitle,
  prepareDownloadDirectory,
  readMetaJson,
  resolveSourceBin,
  runSourceBinary,
  success,
  writeSourceJson,
} from "../_helpers/_source.js";

const LEGACY_HELP = "usage: nextframe source-download <url> --library <path> [--format 720]";
const HELP = "usage: nextframe source-download <project> <episode> --url <url> [--format 720] [--root=PATH] [--json]";

export async function run(argv: string[]) {
  const { positional, flags } = parseSourceFlags(argv, ["library", "format", "url", "root"]);
  if (looksLikeSourcePath(positional[0])) {
    return runLegacy(positional, flags);
  }
  return runProjectMode(positional, flags);
}

async function runLegacy(positional: string[], flags: Record<string, string | boolean>) {
  const [url] = positional;
  if (!url || !flags.library) {
    fail("USAGE", LEGACY_HELP);
  }

  const libraryPath = String(flags.library);
  const format = normalizeFormat(flags.format);
  const binPath = resolveSourceBin();

  try {
    await ensureDirectory(libraryPath);
    await assertSourceBinAvailable(binPath);

    const tempDir = await prepareDownloadDirectory(libraryPath);
    runSourceBinary([
      "download",
      "--url",
      url,
      "--format-height",
      format.replace(/p$/, ""),
      "--out-dir",
      tempDir,
    ], { binPath });

    const meta = await readMetaJson(tempDir);
    const title = pickMetaTitle(meta, url);
    const { finalDir, finalSlug } = await finalizeDownloadDirectory(tempDir, title);
    const source = createSourceDocument({
      id: finalSlug,
      title,
      url,
      durationSec: pickMetaDuration(meta),
      format,
      downloadedAt: new Date().toISOString(),
      transcript: null,
      clips: [],
    });
    await writeSourceJson(finalDir, source);
    success({ ok: true, source_dir: finalDir, source });
    return 0;
  } catch (error: unknown) {
    fail("SOURCE_DOWNLOAD_FAILED", (error as Error).message);
  }
}

async function runProjectMode(positional: string[], flags: Record<string, string | boolean>) {
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName || !flags.url) {
    emit({ ok: false, error: { code: "USAGE", message: HELP } }, flags);
    return 3;
  }

  const url = String(flags.url);
  const format = normalizeFormat(flags.format);
  const root = resolveRoot(flags);
  let context: { root: string; projectName: string; projectPath: string; projectFile: string; project: unknown; episodeName: string; episodePath: string; episodeFile: string };
  try {
    context = await loadProjectContext(root, projectName, episodeName) as typeof context;
  } catch (err: unknown) {
    emit(loadContextError(err, projectName, episodeName), flags);
    return 2;
  }

  const sourcesDir = join(context.episodePath, "sources");
  const binPath = resolveSourceBin();
  let result;
  try {
    await ensureDirectory(sourcesDir);
    await assertSourceBinAvailable(binPath);

    const tempDir = await prepareDownloadDirectory(sourcesDir);
    runSourceBinary([
      "download",
      "--url",
      url,
      "--format-height",
      format.replace(/p$/, ""),
      "--out-dir",
      tempDir,
    ], { binPath });

    const meta = await readMetaJson(tempDir);
    const title = pickMetaTitle(meta, url);
    const { finalDir, finalSlug } = await finalizeDownloadDirectory(tempDir, title);
    const source = createSourceDocument({
      id: finalSlug,
      title,
      url,
      durationSec: pickMetaDuration(meta),
      format,
      downloadedAt: new Date().toISOString(),
      transcript: null,
      clips: [],
    });
    await writeSourceJson(finalDir, source);
    result = { ok: true, source_dir: finalDir, source };
  } catch (err: unknown) {
    emit({ ok: false, error: { code: "SOURCE_DOWNLOAD_FAILED", message: (err as Error).message } }, flags);
    return 2;
  }

  if (flags.json) {
    success(result);
  } else {
    process.stdout.write(`downloaded source into ${result.source_dir}\n`);
  }
  return 0;
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
