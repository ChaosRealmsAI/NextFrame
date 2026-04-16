import { readFile } from "node:fs/promises";

import type { AnchorDict } from "../types.js";

interface TtsWord {
  w: string;
  s: number;
  e: number;
}

interface TtsSegment {
  id: string;
  startMs: number;
  endMs: number;
  words?: TtsWord[];
}

interface TtsPayload {
  segments?: TtsSegment[];
}

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function finiteMs(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("BAD_TTS_PAYLOAD", `field "${field}" must be a finite number >= 0`);
  }
  return value;
}

export default async function ttsFiller(
  input: string,
  opts: { includeWords?: boolean } = {},
): Promise<AnchorDict> {
  const includeWords = opts.includeWords !== false;
  const payload = JSON.parse(await readFile(input, "utf8")) as TtsPayload;
  if (!Array.isArray(payload.segments)) {
    fail("BAD_TTS_PAYLOAD", 'missing "segments" array');
  }

  const dict: AnchorDict = {};
  payload.segments.forEach((segment, segmentIndex) => {
    if (!segment || typeof segment.id !== "string" || !segment.id.trim()) {
      fail("BAD_TTS_PAYLOAD", `segments[${segmentIndex}].id must be a non-empty string`);
    }

    const startMs = finiteMs(segment.startMs, `segments[${segmentIndex}].startMs`);
    const endMs = finiteMs(segment.endMs, `segments[${segmentIndex}].endMs`);
    dict[`${segment.id}.begin`] = { at: startMs };
    dict[`${segment.id}.end`] = { at: endMs };

    if (!includeWords || !Array.isArray(segment.words)) {
      return;
    }

    segment.words.forEach((word, wordIndex) => {
      const begin = finiteMs(word?.s, `segments[${segmentIndex}].words[${wordIndex}].s`);
      const end = finiteMs(word?.e, `segments[${segmentIndex}].words[${wordIndex}].e`);
      dict[`${segment.id}.w${wordIndex}.begin`] = { at: begin, label: word?.w };
      dict[`${segment.id}.w${wordIndex}.end`] = { at: end, label: word?.w };
    });
  });

  return dict;
}
