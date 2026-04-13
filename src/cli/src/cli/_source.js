import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFlags } from "./_io.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const DEFAULT_FORMAT = "720p";
const SOURCE_JSON = "source.json";

export function parseSourceFlags(argv, valuedFlags = []) {
  const valued = new Set(valuedFlags);
  const normalized = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--") || arg.includes("=")) {
      normalized.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (valued.has(name)) {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        normalized.push(`${arg}=${next}`);
        index += 1;
        continue;
      }
    }
    normalized.push(arg);
  }
  return parseFlags(normalized);
}

export function slugifyTitle(title) {
  const value = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return value || "source";
}

export function normalizeFormat(rawFormat) {
  if (rawFormat === undefined || rawFormat === null || rawFormat === true || rawFormat === "") {
    return DEFAULT_FORMAT;
  }
  const value = String(rawFormat).trim().toLowerCase();
  return value.endsWith("p") ? value : `${value}p`;
}

export function createSourceDocument({
  id,
  title,
  url,
  durationSec,
  format = DEFAULT_FORMAT,
  downloadedAt = new Date().toISOString(),
  transcript = null,
  clips = [],
}) {
  return {
    version: "1",
    id,
    title,
    url,
    duration_sec: toFinite(durationSec, 0),
    format: normalizeFormat(format),
    downloaded_at: downloadedAt,
    transcript: transcript ?? null,
    clips: Array.isArray(clips) ? clips : [],
  };
}

export function validateSourceDocument(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["source document must be an object"] };
  }
  if (value.version !== "1") errors.push("version must be \"1\"");
  if (!isNonEmptyString(value.id)) errors.push("id must be a non-empty string");
  if (!isNonEmptyString(value.title)) errors.push("title must be a non-empty string");
  if (!isNonEmptyString(value.url)) errors.push("url must be a non-empty string");
  if (!Number.isFinite(Number(value.duration_sec)) || Number(value.duration_sec) < 0) {
    errors.push("duration_sec must be a finite non-negative number");
  }
  if (!isNonEmptyString(value.format)) errors.push("format must be a non-empty string");
  if (!isNonEmptyString(value.downloaded_at)) errors.push("downloaded_at must be a non-empty string");
  if (value.transcript !== null) {
    if (!value.transcript || typeof value.transcript !== "object" || Array.isArray(value.transcript)) {
      errors.push("transcript must be null or an object");
    } else {
      if (!Number.isInteger(value.transcript.total_sentences) || value.transcript.total_sentences < 0) {
        errors.push("transcript.total_sentences must be a non-negative integer");
      }
      if (!Number.isInteger(value.transcript.total_words) || value.transcript.total_words < 0) {
        errors.push("transcript.total_words must be a non-negative integer");
      }
      if (value.transcript.language !== null && value.transcript.language !== undefined && !isNonEmptyString(value.transcript.language)) {
        errors.push("transcript.language must be a string when present");
      }
      if (value.transcript.model !== null && value.transcript.model !== undefined && !isNonEmptyString(value.transcript.model)) {
        errors.push("transcript.model must be a string when present");
      }
    }
  }
  if (!Array.isArray(value.clips)) {
    errors.push("clips must be an array");
  } else {
    value.clips.forEach((clip, index) => {
      if (!clip || typeof clip !== "object" || Array.isArray(clip)) {
        errors.push(`clips[${index}] must be an object`);
        return;
      }
      if (!Number.isInteger(Number(clip.id)) || Number(clip.id) < 1) errors.push(`clips[${index}].id must be a positive integer`);
      if (!isNonEmptyString(clip.title)) errors.push(`clips[${index}].title must be a non-empty string`);
      if (!Number.isInteger(Number(clip.from_id)) || Number(clip.from_id) < 1) errors.push(`clips[${index}].from_id must be a positive integer`);
      if (!Number.isInteger(Number(clip.to_id)) || Number(clip.to_id) < 1) errors.push(`clips[${index}].to_id must be a positive integer`);
      if (!Number.isFinite(Number(clip.start_sec))) errors.push(`clips[${index}].start_sec must be finite`);
      if (!Number.isFinite(Number(clip.end_sec))) errors.push(`clips[${index}].end_sec must be finite`);
      if (!Number.isFinite(Number(clip.duration_sec)) || Number(clip.duration_sec) < 0) {
        errors.push(`clips[${index}].duration_sec must be a finite non-negative number`);
      }
      if (!isNonEmptyString(clip.file)) errors.push(`clips[${index}].file must be a non-empty string`);
      if (!Array.isArray(clip.subtitles)) {
        errors.push(`clips[${index}].subtitles must be an array`);
      } else {
        clip.subtitles.forEach((subtitle, subtitleIndex) => {
          if (!subtitle || typeof subtitle !== "object" || Array.isArray(subtitle)) {
            errors.push(`clips[${index}].subtitles[${subtitleIndex}] must be an object`);
            return;
          }
          if (!isNonEmptyString(subtitle.text)) errors.push(`clips[${index}].subtitles[${subtitleIndex}].text must be a non-empty string`);
          if (!Number.isInteger(Number(subtitle.start_ms)) || Number(subtitle.start_ms) < 0) {
            errors.push(`clips[${index}].subtitles[${subtitleIndex}].start_ms must be a non-negative integer`);
          }
          if (!Number.isInteger(Number(subtitle.end_ms)) || Number(subtitle.end_ms) < 0) {
            errors.push(`clips[${index}].subtitles[${subtitleIndex}].end_ms must be a non-negative integer`);
          }
        });
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

export async function readSourceJson(sourceDirOrFile) {
  const path = toSourceJsonPath(sourceDirOrFile);
  const value = await readJson(path);
  const validation = validateSourceDocument(value);
  if (!validation.ok) {
    throw new Error(`invalid source.json at ${path}: ${validation.errors.join("; ")}`);
  }
  return value;
}

export async function writeSourceJson(sourceDirOrFile, value) {
  const validation = validateSourceDocument(value);
  if (!validation.ok) {
    throw new Error(`invalid source.json: ${validation.errors.join("; ")}`);
  }
  await writeJson(toSourceJsonPath(sourceDirOrFile), value);
  return value;
}

export async function listSources(libraryPath) {
  let entries = [];
  try {
    entries = await readdir(resolve(libraryPath), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourceDir = join(resolve(libraryPath), entry.name);
    try {
      const source = await readSourceJson(sourceDir);
      rows.push({
        id: source.id,
        title: source.title,
        duration: source.duration_sec,
        transcript_status: source.transcript ? "ready" : "pending",
        clip_count: Array.isArray(source.clips) ? source.clips.length : 0,
      });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
  }

  rows.sort((left, right) =>
    String(left.title).localeCompare(String(right.title)) || String(left.id).localeCompare(String(right.id)));
  return rows;
}

export function resolveSourceBin() {
  if (process.env.NEXTFRAME_SOURCE_BIN) {
    return resolve(process.env.NEXTFRAME_SOURCE_BIN);
  }
  return resolve(REPO_ROOT, "target", "debug", "nf-source");
}

export async function assertSourceBinAvailable(binPath = resolveSourceBin()) {
  try {
    await access(binPath, constants.X_OK);
    return binPath;
  } catch (error) {
    throw new Error(`nf-source binary not found or not executable: ${binPath}`);
  }
}

export function runSourceBinary(args, options = {}) {
  const result = spawnSync(options.binPath || resolveSourceBin(), args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
    throw new Error(stderr || stdout || `nf-source exited with status ${result.status}`);
  }
  return result;
}

export async function ensureDirectory(path) {
  await mkdir(path, { recursive: true });
}

export async function prepareDownloadDirectory(libraryPath) {
  const base = resolve(libraryPath);
  await ensureDirectory(base);
  const tempDir = join(base, `.nf-source-download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await ensureDirectory(tempDir);
  return tempDir;
}

export async function finalizeDownloadDirectory(tempDir, title) {
  const baseDir = dirname(resolve(tempDir));
  const baseSlug = slugifyTitle(title);
  let finalSlug = baseSlug;
  let counter = 2;
  while (await pathExists(join(baseDir, finalSlug))) {
    finalSlug = `${baseSlug}-${counter}`;
    counter += 1;
  }
  const finalDir = join(baseDir, finalSlug);
  await rename(tempDir, finalDir);
  return { finalDir, finalSlug };
}

export function summarizeTranscript(rawSentences, options = {}) {
  const sentences = normalizeSentences(rawSentences);
  const totalWords = sentences.reduce((sum, sentence) => {
    if (sentence.words.length > 0) return sum + sentence.words.length;
    return sum + countWords(sentence.text);
  }, 0);
  const rawLanguage =
    valueOrUndefined(options.language && options.language !== "auto" ? options.language : undefined)
    ?? valueOrUndefined(rawSentences?.language)
    ?? valueOrUndefined(sentences.find((sentence) => sentence.language)?.language)
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

export function normalizeSentences(rawSentences) {
  const list = Array.isArray(rawSentences)
    ? rawSentences
    : Array.isArray(rawSentences?.sentences)
      ? rawSentences.sentences
      : Array.isArray(rawSentences?.items)
        ? rawSentences.items
        : [];
  return list.map((sentence, index) => normalizeSentence(sentence, index));
}

export function buildClipsFromCut(sourceDir, cutReport, rawSentences) {
  const sentences = normalizeSentences(rawSentences);
  const rawClips = Array.isArray(cutReport)
    ? cutReport
    : Array.isArray(cutReport?.clips)
      ? cutReport.clips
      : [];
  return rawClips.map((rawClip, index) => normalizeClip(sourceDir, rawClip, index, sentences));
}

export function success(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export function fail(code, message, extra = {}) {
  const error = { code, message, ...extra };
  process.stdout.write(JSON.stringify({ ok: false, error }, null, 2) + "\n");
  process.exit(1);
}

export function toAbsoluteSourcePath(sourceDir, value) {
  if (!value) return resolve(sourceDir);
  return isAbsolute(value) ? value : resolve(sourceDir, value);
}

export function toRelativeSourcePath(sourceDir, value) {
  if (!value) return value;
  const absolute = toAbsoluteSourcePath(sourceDir, value);
  const rel = relative(resolve(sourceDir), absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return value;
  return rel;
}

export async function loadSentencesSummary(sourceDir, options = {}) {
  const rawSentences = await readJson(join(resolve(sourceDir), "sentences.json"));
  return summarizeTranscript(rawSentences, options);
}

export async function readMetaJson(sourceDir) {
  return readJson(join(resolve(sourceDir), "meta.json"));
}

export function pickMetaTitle(meta, fallbackUrl = "") {
  return valueOrUndefined(meta?.title)
    ?? valueOrUndefined(meta?.video_title)
    ?? valueOrUndefined(meta?.name)
    ?? fallbackUrl;
}

export function pickMetaDuration(meta) {
  return (
    toFinite(meta?.duration_sec)
    ?? toFinite(meta?.duration)
    ?? toFinite(meta?.length_sec)
    ?? toFinite(meta?.video_duration)
    ?? 0
  );
}

function normalizeSentence(sentence, index) {
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

function normalizeWord(word) {
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

function normalizeClip(sourceDir, rawClip, index, sentences) {
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

function buildClipSubtitles(sentences, clip) {
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

function earliestSentenceTime(sentences, fromId, toId) {
  const matches = sentences.filter((sentence) => sentence.id >= fromId && sentence.id <= toId);
  if (matches.length === 0) return null;
  return matches.reduce((min, sentence) => Math.min(min, sentence.start_sec), matches[0].start_sec);
}

function latestSentenceTime(sentences, fromId, toId) {
  const matches = sentences.filter((sentence) => sentence.id >= fromId && sentence.id <= toId);
  if (matches.length === 0) return null;
  return matches.reduce((max, sentence) => Math.max(max, sentence.end_sec), matches[0].end_sec);
}

function pickTime(value, keys) {
  for (const key of keys) {
    const direct = toFinite(value?.[key]);
    if (direct !== undefined) return direct;
    const milliseconds = toFinite(value?.[`${key}_ms`]);
    if (milliseconds !== undefined) return milliseconds / 1000;
  }
  return undefined;
}

function countWords(text) { return String(text || "").trim().split(/\s+/).filter(Boolean).length; }

function toPositiveInteger(value) { const num = Number(value); return Number.isInteger(num) && num > 0 ? num : undefined; }

function toFinite(value, fallback) { const num = Number(value); return Number.isFinite(num) ? num : fallback; }

function round3(value) { return Math.round(Number(value) * 1000) / 1000; }

function isNonEmptyString(value) { return typeof value === "string" && value.trim().length > 0; }

function valueOrUndefined(value) { return isNonEmptyString(value) ? value : undefined; }

function toSourceJsonPath(sourceDirOrFile) {
  const resolved = resolve(sourceDirOrFile);
  return resolved.endsWith(`/${SOURCE_JSON}`) || resolved.endsWith(`\\${SOURCE_JSON}`)
    ? resolved
    : join(resolved, SOURCE_JSON);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
