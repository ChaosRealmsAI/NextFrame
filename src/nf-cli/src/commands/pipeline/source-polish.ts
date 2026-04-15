// Thin CLI for the polish step of the clips pipeline.
// Prints the copywriting task to stdout; when --apply is given, writes the final caption markdown.
import { join, resolve } from "node:path";

import { emit } from "../_helpers/_io.js";
import { loadProjectContext, resolveRoot } from "../_helpers/_project.js";
import {
  ensureDirectory,
  fail,
  parseSourceFlags,
  readJson,
  success,
} from "../_helpers/_source.js";
import { readFile, writeFile } from "node:fs/promises";

const HELP = "usage: nextframe source-polish <project> <episode> --clip <N> --lang <lang> [--apply <caption.md>] [--dry-run] [--root=PATH] [--json]";

export async function run(argv: any) {
  const { positional, flags } = parseSourceFlags(argv, ["clip", "lang", "apply", "root"]);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName || !flags.clip) {
    emit({ ok: false, error: { code: "USAGE", message: HELP } }, flags);
    return 3;
  }

  const clipNum = Number(flags.clip);
  const lang = typeof flags.lang === "string" ? flags.lang : "zh";
  const root = resolveRoot(flags);

  let context;
  try {
    context = await loadProjectContext(root, projectName, episodeName);
  } catch (err) {
    emit({ ok: false, error: { code: "EPISODE_NOT_FOUND", message: err.message } }, flags);
    return 2;
  }

  const clipsDir = join(context.episodePath, "clips");
  const clipNumPad = String(clipNum).padStart(2, "0");
  const outPath = join(clipsDir, `clip_${clipNumPad}.caption.${lang}.md`);

  // --apply mode: just copy the provided markdown to the output location
  if (flags.apply) {
    const sourcePath = resolve(String(flags.apply));
    try {
      const content = await readFile(sourcePath, "utf8");
      await ensureDirectory(clipsDir);
      await writeFile(outPath, content, "utf8");
    } catch (err) {
      emit({ ok: false, error: { code: "APPLY_FAILED", message: err.message } }, flags);
      return 2;
    }
    if (flags.json) {
      success({ ok: true, path: outPath, clip_num: clipNum, lang });
    } else {
      process.stdout.write(`wrote ${outPath}\n`);
    }
    return 0;
  }

  // Load cut_report for clip metadata
  const cutReportPath = join(clipsDir, "cut_report.json");
  let cutReport;
  try {
    cutReport = await readJson(cutReportPath);
  } catch (err) {
    emit({ ok: false, error: { code: "CUT_REPORT_NOT_FOUND", message: `cut_report.json not found — run source-cut first: ${cutReportPath}` } }, flags);
    return 2;
  }

  const reportRows = Array.isArray(cutReport?.success) ? cutReport.success : Array.isArray(cutReport) ? cutReport : [];
  const clipRow = reportRows.find((row: any) => Number(row?.clip_num) === clipNum || Number(row?.id) === clipNum);
  if (!clipRow) {
    emit({ ok: false, error: { code: "CLIP_NOT_FOUND", message: `clip ${clipNum} not found in cut_report.json` } }, flags);
    return 2;
  }

  // Load translations for Chinese content
  const translationsPath = join(clipsDir, `clip_${clipNumPad}.translations.${lang}.json`);
  let translationsData = null;
  try {
    translationsData = await readJson(translationsPath);
  } catch (_err) {
    // optional
  }

  const zhText = translationsData?.segments
    ? translationsData.segments.flatMap((seg: any) => Array.isArray(seg.cn)
    ? seg.cn.map((cue: any) => typeof cue === "string" ? cue : String(cue?.text || ""))
    : []
      ).join("")
    : "(translations not found — run source-translate first)";

  const clipInfo = {
    clip_num: clipNum,
    title: String(clipRow.title || `clip_${clipNumPad}`),
    duration: Number(clipRow.duration || 0).toFixed(1) + "s",
    sentence_range: `句 ${clipRow.from_id}-${clipRow.to_id}`,
    text_preview: String(clipRow.text_preview || "").slice(0, 200),
  };

  process.stdout.write("# Polish Task\n\n");
  process.stdout.write(`Clip: ${clipInfo.title} (clip_${clipNumPad})\n`);
  process.stdout.write(`Duration: ${clipInfo.duration}  |  ${clipInfo.sentence_range}\n`);
  process.stdout.write(`Output: ${outPath}\n\n`);
  process.stdout.write("## Clip info\n\n");
  process.stdout.write(JSON.stringify(clipInfo, null, 2) + "\n\n");
  process.stdout.write("## Chinese subtitles (source content)\n\n");
  process.stdout.write(zhText + "\n\n");
  process.stdout.write("## When done\n\n");
  process.stdout.write(`Run: nextframe source-polish ${projectName} ${episodeName} --clip ${clipNum} --lang ${lang} --apply <caption.md>\n`);
  process.stdout.write("Where <caption.md> is the multi-platform copywriting file.\n");

  return 0;
}

export default run;
