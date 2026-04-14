import { assertSourceBinAvailable, fail, parseSourceFlags, readJson, readSourceJson, resolveSourceBin, runSourceBinary, success, summarizeTranscript, writeSourceJson } from "../_helpers/_source.js";
import { join, resolve } from "node:path";

const HELP = "usage: nextframe source-align <source-dir> --srt <file> [--lang auto]";

export async function run(argv) {
  const { positional, flags } = parseSourceFlags(argv, ["srt", "lang"]);
  const [sourceDirArg] = positional;
  if (!sourceDirArg || !flags.srt) {
    fail("USAGE", HELP);
  }

  const sourceDir = resolve(sourceDirArg);
  const srtPath = resolve(String(flags.srt));
  const lang = typeof flags.lang === "string" ? flags.lang : "auto";
  const binPath = resolveSourceBin();

  try {
    await assertSourceBinAvailable(binPath);
    const source = await readSourceJson(sourceDir);
    runSourceBinary([
      "align",
      join(sourceDir, "source.mp4"),
      "--srt",
      srtPath,
      "--lang",
      lang,
      "-o",
      `${sourceDir}/`,
    ], { binPath });

    const rawSentences = await readJson(join(sourceDir, "sentences.json"));
    const transcript = summarizeTranscript(rawSentences, {
      language: lang,
      previousTranscript: source.transcript,
    });
    const nextSource = { ...source, transcript };
    await writeSourceJson(sourceDir, nextSource);
    success({ ok: true, source_dir: sourceDir, transcript, source: nextSource });
    return 0;
  } catch (error) {
    fail("SOURCE_ALIGN_FAILED", error.message);
  }
}

export default run;
