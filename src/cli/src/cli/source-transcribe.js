import { assertSourceBinAvailable, fail, parseSourceFlags, readJson, readSourceJson, resolveSourceBin, runSourceBinary, success, summarizeTranscript, writeSourceJson } from "./_source.js";
import { join, resolve } from "node:path";

const HELP = "usage: nextframe source-transcribe <source-dir> [--model base.en] [--lang auto]";

export async function run(argv) {
  const { positional, flags } = parseSourceFlags(argv, ["model", "lang"]);
  const [sourceDirArg] = positional;
  if (!sourceDirArg) {
    fail("USAGE", HELP);
  }

  const sourceDir = resolve(sourceDirArg);
  const model = typeof flags.model === "string" ? flags.model : "base.en";
  const lang = typeof flags.lang === "string" ? flags.lang : "auto";
  const binPath = resolveSourceBin();

  try {
    await assertSourceBinAvailable(binPath);
    const source = await readSourceJson(sourceDir);
    runSourceBinary([
      "transcribe",
      join(sourceDir, "source.mp4"),
      "--model",
      model,
      "--lang",
      lang,
      "-o",
      `${sourceDir}/`,
    ], { binPath });

    const rawSentences = await readJson(join(sourceDir, "sentences.json"));
    const transcript = summarizeTranscript(rawSentences, {
      model,
      language: lang,
      previousTranscript: source.transcript,
    });
    const nextSource = { ...source, transcript };
    await writeSourceJson(sourceDir, nextSource);
    success({ ok: true, source_dir: sourceDir, transcript, source: nextSource });
    return 0;
  } catch (error) {
    fail("SOURCE_TRANSCRIBE_FAILED", error.message);
  }
}

export default run;
