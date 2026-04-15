// Provides shared helpers for source-library commands, source.json files, and nf-source integration.
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFlags } from "./_io.js";
import { defaultFixSuggestion } from "./help/index.js";
export {
  buildClipsFromCut,
  loadSentencesSummary,
  normalizeSentences,
  pickMetaDuration,
  pickMetaTitle,
  summarizeTranscript,
  toAbsoluteSourcePath,
  toRelativeSourcePath,
} from "./_source-transcript.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE = src/nf-cli/src/commands/_helpers → go up 5 to reach repo root
const REPO_ROOT = resolve(HERE, "../../../../..");
const DEFAULT_FORMAT = "720p";
const SOURCE_JSON = "source.json";

export function parseSourceFlags(argv: any, valuedFlags = []) {
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

export function looksLikeSourcePath(value: any) {
  return typeof value === "string" && value.includes("/");
}

export function resolveLibraryRoot() {
  return resolve(homedir(), "NextFrame", "library");
}

export async function resolveEpisodeSourceDir(episodePath: any, sourceName: any) {
  const episodeSourcesDir = join(resolve(episodePath), "sources");
  const baseDir = (await directoryExists(episodeSourcesDir))
    ? episodeSourcesDir
    : resolveLibraryRoot();
  if (sourceName) {
    return requireSourceDir(join(baseDir, String(sourceName)));
  }
  return findFirstSourceDir(baseDir);
}

export function slugifyTitle(title: any) {
  const value = String(title || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return value || "source";
}

export function normalizeFormat(rawFormat: any) {
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
  clips = []
}: any) {
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

export function validateSourceDocument(value: any) {
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
    value.clips.forEach((clip: any, index: any) => {
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
        clip.subtitles.forEach((subtitle: any, subtitleIndex: any) => {
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

export async function readJson(path: any) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function writeJson(path: any, value: any) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

export async function readSourceJson(sourceDirOrFile: any) {
  const path = toSourceJsonPath(sourceDirOrFile);
  const value = await readJson(path);
  const validation = validateSourceDocument(value);
  if (!validation.ok) {
    throw new Error(`invalid source.json at ${path}: ${validation.errors.join("; ")}`);
  }
  return value;
}

export async function writeSourceJson(sourceDirOrFile: any, value: any) {
  const validation = validateSourceDocument(value);
  if (!validation.ok) {
    throw new Error(`invalid source.json: ${validation.errors.join("; ")}`);
  }
  await writeJson(toSourceJsonPath(sourceDirOrFile), value);
  return value;
}

export async function listSources(libraryPath: any) {
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

export function runSourceBinary(args: any, options = {}) {
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

export async function ensureDirectory(path: any) {
  await mkdir(path, { recursive: true });
}

export async function prepareDownloadDirectory(libraryPath: any) {
  const base = resolve(libraryPath);
  await ensureDirectory(base);
  const tempDir = join(base, `.nf-source-download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await ensureDirectory(tempDir);
  return tempDir;
}

export async function finalizeDownloadDirectory(tempDir: any, title: any) {
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

export function success(value: any) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export function fail(code: any, message: any, extra = {}) {
  const error = { code, message, fix: extra.fix || extra.hint || defaultFixSuggestion(), ...extra };
  process.stdout.write(JSON.stringify({ ok: false, error }, null, 2) + "\n");
  process.exit(1);
}

export async function readMetaJson(sourceDir: any) {
  return readJson(join(resolve(sourceDir), "meta.json"));
}

function toFinite(value: any, fallback: any) { const num = Number(value); return Number.isFinite(num) ? num : fallback; }

function isNonEmptyString(value: any) { return typeof value === "string" && value.trim().length > 0; }

function toSourceJsonPath(sourceDirOrFile: any) {
  const resolved = resolve(sourceDirOrFile);
  return resolved.endsWith(`/${SOURCE_JSON}`) || resolved.endsWith(`\\${SOURCE_JSON}`)
    ? resolved
    : join(resolved, SOURCE_JSON);
}

async function pathExists(path: any) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function directoryExists(path: any) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function requireSourceDir(path: any) {
  if (await pathExists(join(path, SOURCE_JSON))) {
    return resolve(path);
  }
  throw new Error(`source not found: ${resolve(path)}`);
}

async function findFirstSourceDir(baseDir: any) {
  let entries = [];
  try {
    entries = await readdir(resolve(baseDir), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`no source directories found at ${resolve(baseDir)}`);
    }
    throw error;
  }

  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  for (const name of names) {
    const candidate = join(baseDir, name);
    if (await pathExists(join(candidate, SOURCE_JSON))) {
      return resolve(candidate);
    }
  }
  throw new Error(`no source directories found at ${resolve(baseDir)}`);
}
