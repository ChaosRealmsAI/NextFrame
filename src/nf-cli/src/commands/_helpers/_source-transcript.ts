// Normalizes source transcript data and derives transcript summaries, clips, and subtitles.
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

interface TranscriptOptions {
  language?: string;
  model?: string;
  previousTranscript?: { model?: string };
}

export function summarizeTranscript(rawSentences: unknown, options: TranscriptOptions = {}) {
  const sentences = normalizeSentences(rawSentences);
  const totalWords = sentences.reduce((sum: number, sentence: { words: unknown[]; text: string }) => {
    if (sentence.words.length > 0) return sum + sentence.words.length;
    return sum + countWords(sentence.text);
  }, 0);
  const rawSentencesObj = rawSentences && typeof rawSentences === "object" ? rawSentences as Record<string, unknown> : {};
  const rawLanguage =
    valueOrUndefined(options.language && options.language !== "auto" ? options.language : undefined)
    ?? valueOrUndefined(rawSentencesObj.language)
    ?? valueOrUndefined(sentences.find((sentence: { language?: unknown }) => sentence.language)?.language)
    ?? (options.language === "auto" ? "auto" : null);
  const rawModel =
    valueOrUndefined(options.model)
    ?? valueOrUndefined(rawSentencesObj.model)
    ?? valueOrUndefined(options.previousTranscript?.model)
    ?? null;
  return {
    total_sentences: sentences.length,
    total_words: totalWords,
    language: rawLanguage,
    model: rawModel,
  };
}

export function normalizeSentences(rawSentences: unknown) {
  const raw = rawSentences as Record<string, unknown> | unknown[] | null;
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.sentences)
      ? (raw as Record<string, unknown>).sentences as unknown[]
      : Array.isArray((raw as Record<string, unknown>)?.items)
        ? (raw as Record<string, unknown>).items as unknown[]
        : [];
  return list.map((sentence: unknown, index: number) => normalizeSentence(sentence, index));
}

export function buildClipsFromCut(sourceDir: string, cutReport: unknown, rawSentences: unknown) {
  const sentences = normalizeSentences(rawSentences);
  const cutObj = cutReport as Record<string, unknown> | unknown[];
  const rawClips = Array.isArray(cutObj)
    ? cutObj
    : Array.isArray((cutObj as Record<string, unknown>)?.clips)
      ? (cutObj as Record<string, unknown>).clips as unknown[]
      : [];
  return rawClips.map((rawClip: unknown, index: number) => normalizeClip(sourceDir, rawClip, index, sentences));
}

export function toAbsoluteSourcePath(sourceDir: string, value: string | undefined) {
  if (!value) return resolve(sourceDir);
  return isAbsolute(value) ? value : resolve(sourceDir, value);
}

export function toRelativeSourcePath(sourceDir: string, value: string | undefined) {
  if (!value) return value;
  const absolute = toAbsoluteSourcePath(sourceDir, value);
  const rel = relative(resolve(sourceDir), absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return value;
  return rel;
}

export async function loadSentencesSummary(sourceDir: string, options: TranscriptOptions = {}) {
  const rawSentences = JSON.parse(await readFile(join(resolve(sourceDir), "sentences.json"), "utf8"));
  return summarizeTranscript(rawSentences, options);
}

export function pickMetaTitle(meta: Record<string, unknown> | null | undefined, fallbackUrl = "") {
  return valueOrUndefined(meta?.title)
    ?? valueOrUndefined(meta?.video_title)
    ?? valueOrUndefined(meta?.name)
    ?? fallbackUrl;
}

export function pickMetaDuration(meta: Record<string, unknown> | null | undefined) {
  return (
    toFinite(meta?.duration_sec)
    ?? toFinite(meta?.duration)
    ?? toFinite(meta?.length_sec)
    ?? toFinite(meta?.video_duration)
    ?? 0
  );
}

interface NormalizedWord { text: string; start_sec: number; end_sec: number }
interface NormalizedSentence { id: number; text: string; start_sec: number | undefined; end_sec: number | undefined; language: string | undefined; words: NormalizedWord[] }

function normalizeSentence(sentence: unknown, index: number): NormalizedSentence {
  const s = sentence as Record<string, unknown> | null;
  const words = Array.isArray(s?.words)
    ? (s.words as unknown[]).map(normalizeWord).filter((w): w is NormalizedWord => w !== null)
    : [];
  return {
    id: toPositiveInteger(s?.id) ?? toPositiveInteger(s?.sentence_id) ?? index + 1,
    text: String(s?.text ?? s?.sentence ?? "").trim(),
    start_sec: pickTime(s, ["start_sec", "start", "from", "begin"]),
    end_sec: pickTime(s, ["end_sec", "end", "to", "finish"]),
    language: valueOrUndefined(s?.language),
    words,
  };
}

function normalizeWord(word: unknown): NormalizedWord | null {
  const w = word as Record<string, unknown> | null;
  const text = String(w?.text ?? w?.word ?? "").trim();
  if (!text) return null;
  const startSec = pickTime(w, ["start_sec", "start", "from"]);
  const endSec = pickTime(w, ["end_sec", "end", "to"]);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
  return {
    text,
    start_sec: startSec as number,
    end_sec: endSec as number,
  };
}

function normalizeClip(sourceDir: string, rawClip: unknown, index: number, sentences: NormalizedSentence[]) {
  const rc = rawClip as Record<string, unknown> | null;
  const id = toPositiveInteger(rc?.id) ?? index + 1;
  const fromId = toPositiveInteger(rc?.from_id) ?? toPositiveInteger(rc?.from) ?? id;
  const toId = toPositiveInteger(rc?.to_id) ?? toPositiveInteger(rc?.to) ?? fromId;
  const startSec =
    pickTime(rc, ["start_sec", "start", "in"]) ?? earliestSentenceTime(sentences, fromId, toId) ?? 0;
  const endSec =
    pickTime(rc, ["end_sec", "end", "out"])
    ?? latestSentenceTime(sentences, fromId, toId)
    ?? startSec;
  const durationSec = toFinite(rc?.duration_sec) ?? Math.max(0, endSec - startSec);
  return {
    id,
    title: valueOrUndefined(rc?.title) ?? valueOrUndefined(rc?.name) ?? `Clip ${id}`,
    from_id: fromId,
    to_id: toId,
    start_sec: round3(startSec),
    end_sec: round3(endSec),
    duration_sec: round3(durationSec),
    file: toRelativeSourcePath(sourceDir, (rc?.file ?? rc?.path ?? `clips/clip_${String(id).padStart(2, "0")}.mp4`) as string),
    subtitles: buildClipSubtitles(sentences, {
      fromId,
      toId,
      startSec,
      endSec,
    }),
  };
}

function buildClipSubtitles(sentences: NormalizedSentence[], clip: { fromId: number; toId: number; startSec: number; endSec: number }) {
  const words = [];
  for (const sentence of sentences) {
    const inRange = sentence.id >= clip.fromId && sentence.id <= clip.toId;
    if (!inRange && sentence.words.length === 0) continue;
    if (!inRange) continue;
    if (sentence.words.length > 0) {
      for (const word of sentence.words) {
        const startMs = Math.max(0, Math.round((word.start_sec - clip.startSec) * 1000));
        const endMs = Math.max(startMs, Math.round((word.end_sec - clip.startSec) * 1000));
        words.push({
          text: word.text,
          start_ms: startMs,
          end_ms: endMs,
        });
      }
      continue;
    }
    if (!sentence.text) continue;
    const startMs = Math.max(0, Math.round(((sentence.start_sec ?? clip.startSec) - clip.startSec) * 1000));
    const endMs = Math.max(startMs, Math.round(((sentence.end_sec ?? clip.startSec) - clip.startSec) * 1000));
    words.push({
      text: sentence.text,
      start_ms: startMs,
      end_ms: endMs,
    });
  }
  return words;
}

function earliestSentenceTime(sentences: NormalizedSentence[], fromId: number, toId: number) {
  const matches = sentences.filter((sentence) => sentence.id >= fromId && sentence.id <= toId);
  if (matches.length === 0) return null;
  return matches.reduce((min: number, sentence) => Math.min(min, sentence.start_sec ?? Infinity), matches[0].start_sec ?? 0);
}

function latestSentenceTime(sentences: NormalizedSentence[], fromId: number, toId: number) {
  const matches = sentences.filter((sentence) => sentence.id >= fromId && sentence.id <= toId);
  if (matches.length === 0) return null;
  return matches.reduce((max: number, sentence) => Math.max(max, sentence.end_sec ?? 0), matches[0].end_sec ?? 0);
}

function pickTime(value: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const direct = toFinite(value?.[key]);
    if (direct !== undefined) return direct;
    const milliseconds = toFinite(value?.[`${key}_ms`]);
    if (milliseconds !== undefined) return milliseconds / 1000;
  }
  return undefined;
}

function countWords(text: unknown) { return String(text || "").trim().split(/\s+/).filter(Boolean).length; }

function toPositiveInteger(value: unknown) { const num = Number(value); return Number.isInteger(num) && num > 0 ? num : undefined; }

function toFinite(value: unknown, fallback?: number): number | undefined { const num = Number(value); return Number.isFinite(num) ? num : fallback; }

function round3(value: unknown) { return Math.round(Number(value) * 1000) / 1000; }

function isNonEmptyString(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }

function valueOrUndefined(value: unknown): string | undefined { return isNonEmptyString(value) ? value : undefined; }
