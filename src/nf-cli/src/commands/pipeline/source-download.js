// Downloads a source video into the library and initializes its source.json metadata.
import { finalizeDownloadDirectory, createSourceDocument, ensureDirectory, fail, normalizeFormat, parseSourceFlags, pickMetaDuration, pickMetaTitle, prepareDownloadDirectory, readMetaJson, resolveSourceBin, runSourceBinary, success, writeSourceJson, assertSourceBinAvailable } from "../_helpers/_source.js";

const HELP = "usage: nextframe source-download <url> --library <path> [--format 720]";

export async function run(argv) {
  const { positional, flags } = parseSourceFlags(argv, ["library", "format"]);
  const [url] = positional;
  if (!url || !flags.library) {
    fail("USAGE", HELP);
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
      url,
      "--format",
      format.replace(/p$/, ""),
      "-o",
      `${tempDir}/`,
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
  } catch (error) {
    fail("SOURCE_DOWNLOAD_FAILED", error.message);
  }
}

export default run;
