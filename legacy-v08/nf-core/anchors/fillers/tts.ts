import { readFile } from "node:fs/promises";

import type { AnchorDict } from "../types.js";

interface TtsWord {
  w?: string;
  word?: string;
  s?: number;
  e?: number;
  start_ms?: number;
  end_ms?: number;
}

interface TtsSegment {
  id?: string;
  startMs?: number;
  endMs?: number;
  start_ms?: number;
  end_ms?: number;
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

// nf-tts outputs snake_case; legacy payloads use camelCase. Accept either.
function pickMs(camel: unknown, snake: unknown, field: string) {
  const value = typeof camel === "number" ? camel : snake;
  return finiteMs(value, field);
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
    if (!segment) {
      fail("BAD_TTS_PAYLOAD", `segments[${segmentIndex}] is null/undefined`);
    }

    // id optional — nf-tts outputs lack id; fall back to deterministic s{index}.
    const segId = (typeof segment.id === "string" && segment.id.trim())
      ? segment.id.trim()
      : `s${segmentIndex}`;

    const startMs = pickMs(segment.startMs, segment.start_ms, `segments[${segmentIndex}].start(Ms|_ms)`);
    const endMs = pickMs(segment.endMs, segment.end_ms, `segments[${segmentIndex}].end(Ms|_ms)`);
    dict[`${segId}.begin`] = { at: startMs };
    dict[`${segId}.end`] = { at: endMs };

    if (!includeWords || !Array.isArray(segment.words)) {
      return;
    }

    segment.words.forEach((word, wordIndex) => {
      const begin = pickMs(word?.s, word?.start_ms, `segments[${segmentIndex}].words[${wordIndex}].(s|start_ms)`);
      const end = pickMs(word?.e, word?.end_ms, `segments[${segmentIndex}].words[${wordIndex}].(e|end_ms)`);
      const label = word?.w ?? word?.word;
      dict[`${segId}.w${wordIndex}.begin`] = { at: begin, label };
      dict[`${segId}.w${wordIndex}.end`] = { at: end, label };
    });
  });

  return dict;
}
