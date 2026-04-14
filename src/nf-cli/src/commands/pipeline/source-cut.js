// Cuts clips from a source video using a plan and saves the resulting clip metadata.
import { assertSourceBinAvailable, buildClipsFromCut, fail, parseSourceFlags, readJson, readSourceJson, resolveSourceBin, runSourceBinary, success, writeSourceJson } from "../_helpers/_source.js";
import { join, resolve } from "node:path";

const HELP = "usage: nextframe source-cut <source-dir> --plan <plan.json> [--margin 0.2]";

export async function run(argv) {
  const { positional, flags } = parseSourceFlags(argv, ["plan", "margin"]);
  const [sourceDirArg] = positional;
  if (!sourceDirArg || !flags.plan) {
    fail("USAGE", HELP);
  }

  const sourceDir = resolve(sourceDirArg);
  const planPath = resolve(String(flags.plan));
  const margin = typeof flags.margin === "string" ? flags.margin : "0.2";
  const binPath = resolveSourceBin();

  try {
    await assertSourceBinAvailable(binPath);
    const source = await readSourceJson(sourceDir);
    runSourceBinary([
      "cut",
      "--video",
      join(sourceDir, "source.mp4"),
      "--sentences",
      `${sourceDir}/`,
      "--plan",
      planPath,
      "--margin",
      String(margin),
      "-o",
      `${join(sourceDir, "clips")}/`,
    ], { binPath });

    const cutReport = await readJson(join(sourceDir, "cut_report.json"));
    const sentences = await readJson(join(sourceDir, "sentences.json"));
    const clips = buildClipsFromCut(sourceDir, cutReport, sentences);
    const nextSource = { ...source, clips };
    await writeSourceJson(sourceDir, nextSource);
    success({ ok: true, source_dir: sourceDir, clips, source: nextSource });
    return 0;
  } catch (error) {
    fail("SOURCE_CUT_FAILED", error.message);
  }
}

export default run;
