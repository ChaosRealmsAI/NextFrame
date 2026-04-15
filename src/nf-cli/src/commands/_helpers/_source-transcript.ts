// Normalizes source transcript data and derives transcript summaries, clips, and subtitles.
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export function summarizeTranscript(rawSentences: any, options = {}) {
  const sentences = normalizeSentences(rawSentences);
  const totalWords = sentences.reduce((sum: any, sentence: any) => {
    if (sentence.words.length > 0) return sum + sentence.words.length;
    return sum + countWords(sentence.text);
  }, 0);
  const rawLanguage =
    valueOrUndefined(options.language && options.language !== "auto" ? options.language : undefined)
    ?? valueOrUndefined(rawSentences?.language)
    ?? valueOrUndefined(sentences.find((sentence: any) => sentence.language)?.language)
    ?? (options.language === "auto" ? "auto" : null);
  const rawModel =
    valueOrUndefined(options.model)
    ?? valueOrUndefined(rawSentences?.model)
    ?? valueOrUndefined(options.previousTranscript?.model)
    ?? null;
  return {
    total_sentences: sentences.length,
    total_words: totalWords,
    language: rawLanguage,
    model: rawModel,
  };
}

export function normalizeSentences(rawSentences: any) {
  const list = Array.isArray(rawSentences)
    ? rawSentences
    : Array.isArray(rawSentences?.sentences)
      ? rawSentences.sentences
      : Array.isArray(rawSentences?.items)
        ? rawSentences.items
        : [];
  return list.map((sentence: any, index: any) => normalizeSentence(sentence, index));
}

export function buildClipsFromCut(sourceDir: any, cutReport: any, rawSentences: any) {
  const sentences = normalizeSentences(rawSentences);
  const rawClips = Array.isArray(cutReport)
    ? cutReport
    : Array.isArray(cutReport?.clips)
      ? cutReport.clips
      : [];
  return rawClips.map((rawClip: any, index: any) => normalizeClip(sourceDir, rawClip, index, sentences));
}

export function toAbsoluteSourcePath(sourceDir: any, value: any) {
  if (!value) return resolve(sourceDir);
  return isAbsolute(value) ? value : resolve(sourceDir, value);
}

export function toRelativeSourcePath(sourceDir: any, value: any) {
  if (!value) return value;
  const absolute = toAbsoluteSourcePath(sourceDir, value);
  const rel = relative(resolve(sourceDir), absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return value;
  return rel;
}

export async function loadSentencesSummary(sourceDir: any, options = {}) {
  const rawSentences = JSON.parse(await readFile(join(resolve(sourceDir), "sentences.json"), "utf8"));
  return summarizeTranscript(rawSentences, options);
}

export function pickMetaTitle(meta: any, fallbackUrl = "") {
  return valueOrUndefined(meta?.title)
    ?? valueOrUndefined(meta?.video_title)
    ?? valueOrUndefined(meta?.name)
    ?? fallbackUrl;
}

export function pickMetaDuration(meta: any) {
  return (
    toFinite(meta?.duration_sec)
    ?? toFinite(meta?.duration)
    ?? toFinite(meta?.length_sec)
    ?? toFinite(meta?.video_duration)
    ?? 0
  );
}

function normalizeSentence(sentence: any, index: any) {
  const words = Array.isArray(sentence?.words)
    ? sentence.words.map(normalizeWord).filter(Boolean)
    : [];
  return {
    id: toPositiveInteger(sentence?.id) ?? toPositiveInteger(sentence?.sentence_id) ?? index + 1,
    text: String(sentence?.text ?? sentence?.sentence ?? "").trim(),
    start_sec: pickTime(sentence, ["start_sec", "start", "from", "begin"]),
    end_sec: pickTime(sentence, ["end_sec", "end", "to", "finish"]),
    language: valueOrUndefined(sentence?.language),
    words,
  };
}

function normalizeWord(word: any) {
  const text = String(word?.text ?? word?.word ?? "").trim();
  if (!text) return null;
  const startSec = pickTime(word, ["start_sec", "start", "from"]);
  const endSec = pickTime(word, ["end_sec", "end", "to"]);
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
  return {
    text,
    start_sec: startSec,
    end_sec: endSec,
  };
}

function normalizeClip(sourceDir: any, rawClip: any, index: any, sentences: any) {
  const id = toPositiveInteger(rawClip?.id) ?? index + 1;
  const fromId = toPositiveInteger(rawClip?.from_id) ?? toPositiveInteger(rawClip?.from) ?? id;
  const toId = toPositiveInteger(rawClip?.to_id) ?? toPositiveInteger(rawClip?.to) ?? fromId;
  const startSec =
    pickTime(rawClip, ["start_sec", "start", "in"]) ?? earliestSentenceTime(sentences, fromId, toId) ?? 0;
  const endSec =
    pickTime(rawClip, ["end_sec", "end", "out"])
    ?? latestSentenceTime(sentences, fromId, toId)
    ?? startSec;
  const durationSec = toFinite(rawClip?.duration_sec) ?? Math.max(0, endSec - startSec);
  return {
    id,
    title: valueOrUndefined(rawClip?.title) ?? valueOrUndefined(rawClip?.name) ?? `Clip ${id}`,
    from_id: fromId,
    to_id: toId,
    start_sec: round3(startSec),
    end_sec: round3(endSec),
    duration_sec: round3(durationSec),
    file: toRelativeSourcePath(sourceDir, rawClip?.file ?? rawClip?.path ?? `clips/clip_${String(id).padStart(2, "0")}.mp4`),
    subtitles: buildClipSubtitles(sentences, {
      fromId,
      toId,
      startSec,
      endSec,
    }),
  };
}

function buildClipSubtitles(sentences: any, clip: any) {
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
    const startMs = Math.max(0, Math.round((sentence.start_sec - clip.startSec) * 1000));
    const endMs = Math.max(startMs, Math.round((sentence.end_sec - clip.startSec) * 1000));
    words.push({
      text: sentence.text,
      start_ms: startMs,
      end_ms: endMs,
    });
  }
  return words;
}

function earliestSentenceTime(sentences: any, fromId: any, toId: any) {
  const matches = sentences.filter((sentence: any) => sentence.id >= fromId && sentence.id <= toId);
  if (matches.length === 0) return null;
  return matches.reduce((min: any, sentence: any) => Math.min(min, sentence.start_sec), matches[0].start_sec);
}

function latestSentenceTime(sentences: any, fromId: any, toId: any) {
  const matches = sentences.filter((sentence: any) => sentence.id >= fromId && sentence.id <= toId);
  if (matches.length === 0) return null;
  return matches.reduce((max: any, sentence: any) => Math.max(max, sentence.end_sec), matches[0].end_sec);
}

function pickTime(value: any, keys: any) {
  for (const key of keys) {
    const direct = toFinite(value?.[key]);
    if (direct !== undefined) return direct;
    const milliseconds = toFinite(value?.[`${key}_ms`]);
    if (milliseconds !== undefined) return milliseconds / 1000;
  }
  return undefined;
}

function countWords(text: any) { return String(text || "").trim().split(/\s+/).filter(Boolean).length; }

function toPositiveInteger(value: any) { const num = Number(value); return Number.isInteger(num) && num > 0 ? num : undefined; }

function toFinite(value: any, fallback: any) { const num = Number(value); return Number.isFinite(num) ? num : fallback; }

function round3(value: any) { return Math.round(Number(value) * 1000) / 1000; }

function isNonEmptyString(value: any) { return typeof value === "string" && value.trim().length > 0; }

function valueOrUndefined(value: any) { return isNonEmptyString(value) ? value : undefined; }
