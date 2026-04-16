import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { parseFlags, emit } from "../_helpers/_io.js";

function toMs(entry: Record<string, unknown>, msKey: string, secKey: string) {
  const msValue = Number(entry[msKey]);
  if (Number.isFinite(msValue)) return Math.round(msValue);
  const secValue = Number(entry[secKey]);
  if (Number.isFinite(secValue)) return Math.round(secValue * 1000);
  return NaN;
}

function segmentId(segment: Record<string, unknown>, index: number, filePath: string) {
  if (typeof segment.id === "string" && segment.id.trim()) return segment.id.trim();
  const stem = basename(filePath).replace(/\.words\.json$/i, "").replace(/\.json$/i, "");
  if (stem === "seg0" || /^seg\d+$/.test(stem)) return stem;
  return `seg${index}`;
}

export async function run(argv: string[]): Promise<number> {
  const { positional, flags } = parseFlags(argv);
  const wordsPath = positional[0];
  if (!wordsPath) {
    emit({
      ok: false,
      error: {
        code: "USAGE",
        message: "usage: nextframe anchors from-tts <words.json> [--out=anchors.json] [--json]",
      },
    }, flags);
    return 3;
  }

  let payload;
  try {
    payload = JSON.parse(await readFile(wordsPath, "utf8"));
  } catch (error) {
    emit({
      ok: false,
      error: {
        code: "LOAD_FAIL",
        message: `cannot load ${wordsPath}: ${(error as Error).message}`,
      },
    }, flags);
    return 2;
  }

  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  if (segments.length === 0) {
    emit({
      ok: false,
      error: {
        code: "BAD_TTS_WORDS",
        message: `${wordsPath} must contain segments[] with timing data`,
        fix: "Use a TTS words payload with at least one segment and retry.",
      },
    }, flags);
    return 2;
  }

  const anchors: Record<string, { at: number }> = {};
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    const id = segmentId(segment, index, wordsPath);
    const segStart = toMs(segment, "start_ms", "start");
    const segEnd = toMs(segment, "end_ms", "end");
    if (!Number.isFinite(segStart) || !Number.isFinite(segEnd)) {
      emit({
        ok: false,
        error: {
          code: "BAD_TTS_WORDS",
          message: `segment ${index} is missing start/end timing`,
          fix: "Ensure each segment has start_ms/end_ms or start/end fields.",
        },
      }, flags);
      return 2;
    }
    anchors[`${id}.begin`] = { at: segStart };
    anchors[`${id}.end`] = { at: segEnd };

    const words = Array.isArray(segment?.words) ? segment.words : [];
    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
      const word = words[wordIndex];
      const wordStart = toMs(word, "start_ms", "start");
      const wordEnd = toMs(word, "end_ms", "end");
      if (!Number.isFinite(wordStart) || !Number.isFinite(wordEnd)) continue;
      anchors[`${id}.w${wordIndex}.begin`] = { at: wordStart };
      anchors[`${id}.w${wordIndex}.end`] = { at: wordEnd };
    }
  }

  const outPath = typeof flags.out === "string"
    ? resolve(String(flags.out))
    : typeof flags.output === "string"
      ? resolve(String(flags.output))
      : null;
  if (outPath) {
    await writeFile(outPath, JSON.stringify(anchors, null, 2) + "\n", "utf8");
  }

  emit({
    ok: true,
    value: {
      path: outPath,
      added_count: Object.keys(anchors).length,
      anchors,
    },
  }, flags);
  return 0;
}
