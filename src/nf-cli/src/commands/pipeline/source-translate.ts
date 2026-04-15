// Thin CLI for the translate step of the clips pipeline.
// Prints the translation task to stdout; when --apply is given, finalizes the output file.
import { join, resolve } from "node:path";

import { emit } from "../_helpers/_io.js";
import { loadProjectContext, resolveRoot } from "../_helpers/_project.js";
import {
  ensureDirectory,
  fail,
  parseSourceFlags,
  readJson,
  success,
  writeJson,
} from "../_helpers/_source.js";

const HELP = "usage: nextframe source-translate <project> <episode> --clip <N> --lang <lang> [--apply <response.json>] [--dry-run] [--root=PATH] [--json]";

export async function run(argv: string[]) {
  const { positional, flags } = parseSourceFlags(argv, ["clip", "lang", "apply", "root", "source"]);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName || !flags.clip) {
    emit({ ok: false, error: { code: "USAGE", message: HELP } }, flags);
    return 3;
  }

  const clipNum = Number(flags.clip);
  const lang = typeof flags.lang === "string" ? flags.lang : "zh";
  const root = resolveRoot(flags);

  let context: { root: string; projectName: string; projectPath: string; projectFile: string; project: unknown; episodeName: string; episodePath: string; episodeFile: string };
  try {
    context = await loadProjectContext(root, projectName, episodeName) as typeof context;
  } catch (err: unknown) {
    emit({ ok: false, error: { code: "EPISODE_NOT_FOUND", message: (err as Error).message } }, flags);
    return 2;
  }

  const clipsDir = join(context.episodePath, "clips");
  const cutReportPath = join(clipsDir, "cut_report.json");
  let cutReport;
  try {
    cutReport = await readJson(cutReportPath);
  } catch (err) {
    emit({ ok: false, error: { code: "CUT_REPORT_NOT_FOUND", message: `cut_report.json not found — run source-cut first: ${cutReportPath}` } }, flags);
    return 2;
  }

  const reportRows = Array.isArray(cutReport?.success) ? cutReport.success : Array.isArray(cutReport) ? cutReport : [];
  const clipRow = reportRows.find((row: Record<string, unknown>) => Number(row?.clip_num) === clipNum || Number(row?.id) === clipNum);
  if (!clipRow) {
    emit({ ok: false, error: { code: "CLIP_NOT_FOUND", message: `clip ${clipNum} not found in cut_report.json` } }, flags);
    return 2;
  }

  // Resolve which source this clip belongs to:
  // 1. If --source flag given, use it directly
  // 2. Otherwise, scan all source dirs and find the one whose sentences.json contains [from_id, to_id] with matching text_preview
  const sourcesDir = join(context.episodePath, "sources");
  let sentencesPath;
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(sourcesDir, { withFileTypes: true });
    const sourceDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    if (!sourceDirs.length) throw new Error("no source dir");

    if (typeof flags.source === "string" && flags.source.trim()) {
      const explicit = flags.source.trim();
      if (!sourceDirs.includes(explicit)) {
        emit({ ok: false, error: { code: "SOURCE_NOT_FOUND", message: `--source '${explicit}' not in ${sourcesDir}` } }, flags);
        return 2;
      }
      sentencesPath = join(sourcesDir, explicit, "sentences.json");
    } else if (sourceDirs.length === 1) {
      sentencesPath = join(sourcesDir, sourceDirs[0], "sentences.json");
    } else {
      // Multi-source: pick the source whose sentence id range covers [from_id, to_id] and whose text aligns with text_preview
      const fromIdScan = Number(clipRow.from_id);
      const toIdScan = Number(clipRow.to_id);
      const previewHead = String(clipRow.text_preview || "").split("...")[0].trim().slice(0, 30);
      let matched = null;
      for (const dirName of sourceDirs) {
        try {
          const candidate = await readJson(join(sourcesDir, dirName, "sentences.json"));
          const sents = Array.isArray(candidate?.sentences) ? candidate.sentences : [];
          const fromS = sents.find((s: Record<string, unknown>) => Number(s?.id) === fromIdScan);
          if (fromS && (!previewHead || String(fromS.text || "").includes(previewHead.slice(0, 15)))) {
            matched = dirName;
            break;
          }
        } catch (_e) { /* skip */ }
      }
      if (!matched) {
        emit({ ok: false, error: { code: "SOURCE_AMBIGUOUS", message: `multiple sources, could not match clip ${clipNum}. Pass --source <slug> explicitly. Available: ${sourceDirs.join(", ")}` } }, flags);
        return 2;
      }
      sentencesPath = join(sourcesDir, matched, "sentences.json");
    }
  } catch (err: unknown) {
    emit({ ok: false, error: { code: "SOURCE_NOT_FOUND", message: `no source found in ${sourcesDir}: ${(err as Error).message}` } }, flags);
    return 2;
  }

  let sentencesData;
  try {
    sentencesData = await readJson(sentencesPath);
  } catch (err) {
    emit({ ok: false, error: { code: "SENTENCES_NOT_FOUND", message: `sentences.json not found — run source-transcribe first: ${sentencesPath}` } }, flags);
    return 2;
  }

  const fromId = Number(clipRow.from_id);
  const toId = Number(clipRow.to_id);
  const allSentences = Array.isArray(sentencesData?.sentences) ? sentencesData.sentences : [];
  const clipSentences = allSentences.filter((s: Record<string, unknown>) => Number(s?.id) >= fromId && Number(s?.id) <= toId);

  const segments = clipSentences.map((s: Record<string, unknown>) => ({
    id: Number(s.id),
    en: String(s.text || ""),
    start: Number(s.start),
    end: Number(s.end)
  }));

  const clipNumPad = String(clipNum).padStart(2, "0");
  const outPath = join(clipsDir, `clip_${clipNumPad}.translations.${lang}.json`);

  // --apply mode: read agent response (array of {id, cn:[...]}) → compute timestamps → write final JSON
  if (flags.apply) {
    const responsePath = resolve(String(flags.apply));
    let agentResponse;
    try {
      agentResponse = await readJson(responsePath);
    } catch (err: unknown) {
      emit({ ok: false, error: { code: "RESPONSE_READ_FAILED", message: (err as Error).message } }, flags);
      return 2;
    }

    const responseMap: Record<number, unknown[]> = {};
    const rows = Array.isArray(agentResponse) ? agentResponse : [];
    rows.forEach((row) => { responseMap[Number(row.id)] = Array.isArray(row.cn) ? row.cn : []; });

    const finalSegments = segments.map((seg: { id: number; en: string; start: number; end: number }) => {
      const cnTexts = responseMap[seg.id] || [];
      const cues = interpolateCues(cnTexts, seg.start, seg.end);
      return { id: seg.id, en: seg.en, start: seg.start, end: seg.end, cn: cues };
    });

    await ensureDirectory(clipsDir);
    const output = {
      clip_num: clipNum,
      lang,
      segments: finalSegments,
    };
    await writeJson(outPath, output);

    if (flags.json) {
      success({ ok: true, path: outPath, clip_num: clipNum, lang, segment_count: finalSegments.length });
    } else {
      process.stdout.write(`wrote ${outPath}\n`);
    }
    return 0;
  }

  // Print task mode: show the prompt + segments for the agent
  const taskInput = {
    clip_num: clipNum,
    clip_title: String(clipRow.title || `clip_${clipNumPad}`),
    lang,
    output_path: outPath,
    segments: segments.map((s: Record<string, unknown>) => ({
      id: s.id,
      en: s.en
    })),
  };

  if (flags["dry-run"] || flags.dryRun) {
    success({ ok: true, task: taskInput });
    return 0;
  }

  process.stdout.write("# Translation Task\n\n");
  process.stdout.write(`Clip: ${taskInput.clip_title} (clip_${clipNumPad})\n`);
  process.stdout.write(`Lang: ${lang}\n`);
  process.stdout.write(`Output: ${outPath}\n\n`);
  process.stdout.write("## Segments to translate\n\n");
  process.stdout.write(JSON.stringify(taskInput.segments, null, 2) + "\n\n");
  process.stdout.write("## When done\n\n");
  process.stdout.write(`Run: nextframe source-translate ${projectName} ${episodeName} --clip ${clipNum} --lang ${lang} --apply <response.json>\n`);
  process.stdout.write("Where <response.json> is an array of {id, cn: [\"完整句1\", ...]} objects.\n");

  return 0;
}

// Linear time interpolation: distribute cue texts across [segStart, segEnd] proportional to char count.
function interpolateCues(cnTexts: unknown[], segStart: number, segEnd: number) {
  const texts = cnTexts.map((t: unknown) => typeof t === "string" ? t : String((t as Record<string, unknown>)?.text || ""));
  if (!texts.length) return [];
  if (!Number.isFinite(segStart) || !Number.isFinite(segEnd) || segEnd <= segStart) {
    return texts.map((text: string) => ({
      text,
      start: segStart || 0,
      end: segEnd || 0
    }));
  }

  const totalChars = texts.reduce((sum: number, t: string) => sum + t.length, 0);
  const totalDuration = segEnd - segStart;
  const cues: { text: string; start: number; end: number }[] = [];
  let cursor = segStart;

  texts.forEach((text: string, index: number) => {
    const charShare = totalChars > 0 ? text.length / totalChars : 1 / texts.length;
    const cueEnd = index === texts.length - 1 ? segEnd : Math.round((cursor + charShare * totalDuration) * 1000) / 1000;
    cues.push({ text, start: Math.round(cursor * 1000) / 1000, end: cueEnd });
    cursor = cueEnd;
  });

  return cues;
}

export default run;
