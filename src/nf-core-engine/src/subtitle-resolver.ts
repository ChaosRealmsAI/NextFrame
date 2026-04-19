// Stage 2.5: subtitle source resolution.
// ADR-055 subtitle dual-mode source: bundle.html is single-file self-contained
// (ADR-042) + runtime zero-network, so the 3 source variants must be resolved
// to inline words[] at BUILD time, before bundler runs. This step runs AFTER
// resolve() (we need audio track params.src already resolved) and BEFORE
// bundle() (which inlines the JSON as-is).
//
// 3 source modes per subtitle clip (params.source):
//   Mode A: { audio_track_id: "narration" }   -> look up audio track, derive timeline path, read words
//   Mode B: { timeline_path: "/abs/path.json" } -> read file directly
//   Mode C: { words: [...] }                   -> pass through (already inline)
//
// Mutates tracks in-place: after this step, every subtitle clip has
// params.source === { words: [...] } (Mode C shape).
//
// Errors:
//   - strict:false (default) -> warn + fill empty words[] (renders nothing, no crash)
//   - strict:true  -> throw StageErrorException with E_SUBTITLE_SOURCE_* code

import { readFileSync as nodeReadFileSync, existsSync as nodeExistsSync } from 'node:fs';
import type { ResolvedTrack, ResolvedClip } from './types.js';
import { StageErrorException } from './types.js';
import type { StageError } from './types.js';

export interface SubtitleResolverOpts {
  // When true, missing files / missing audio tracks / invalid timeline JSON
  // throw StageErrorException. When false (default), they warn and fall back
  // to empty words[]. Keeps build resilient for dev iteration.
  strict?: boolean;
  // Filesystem injection for testability. Defaults to node:fs.
  fs?: {
    readFileSync: (p: string, enc: 'utf8') => string;
    existsSync: (p: string) => boolean;
  };
  // Optional logger for warnings. Defaults to console.warn.
  log?: (msg: string) => void;
}

interface WordEntry {
  text: string;
  start_ms: number;
  end_ms: number;
}

function subtitleError(
  code: string,
  message: string,
  fix_hint?: string,
  clip_id?: string,
): StageErrorException {
  const err: StageError = { stage: 'resolve', code, message };
  if (fix_hint !== undefined) err.fix_hint = fix_hint;
  if (clip_id !== undefined) err.loc = { clip_id };
  return new StageErrorException(err);
}

// Convert file:// URL or bare path to a local filesystem path.
// Accepts: file:///abs/path.mp3 | /abs/path.mp3 | ./rel/path.mp3
function fileUrlToPath(srcOrUrl: string): string {
  if (srcOrUrl.startsWith('file://')) {
    try {
      return new URL(srcOrUrl).pathname;
    } catch {
      // Fallback: strip prefix.
      return srcOrUrl.slice('file://'.length);
    }
  }
  return srcOrUrl;
}

// Convention: <basename>.mp3 -> <basename>.timeline.json
// Works for any audio extension by simple replace; if src has no extension,
// append .timeline.json.
function deriveTimelinePath(audioPath: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(audioPath);
  if (m) {
    return audioPath.slice(0, -m[0].length) + '.timeline.json';
  }
  return audioPath + '.timeline.json';
}

function isWordEntry(x: unknown): x is WordEntry {
  if (!x || typeof x !== 'object') return false;
  const w = x as Record<string, unknown>;
  return (
    typeof w.text === 'string' &&
    typeof w.start_ms === 'number' &&
    typeof w.end_ms === 'number'
  );
}

function parseTimelineWords(
  json: string,
  filePath: string,
  strict: boolean,
  log: (msg: string) => void,
  clipId: string | undefined,
): WordEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const msg = `subtitle timeline JSON parse failed at ${filePath}: ${e instanceof Error ? e.message : String(e)}`;
    if (strict) {
      throw subtitleError('E_SUBTITLE_TIMELINE_JSON', msg, 'Ensure timeline file is valid JSON.', clipId);
    }
    log(`[subtitle-resolver] ${msg}`);
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { words?: unknown }).words)) {
    const msg = `subtitle timeline at ${filePath} missing .words array`;
    if (strict) {
      throw subtitleError('E_SUBTITLE_TIMELINE_SHAPE', msg, 'Timeline file must be {duration_ms, voice, words:[{text,start_ms,end_ms}...]}.', clipId);
    }
    log(`[subtitle-resolver] ${msg}`);
    return [];
  }
  const words = (parsed as { words: unknown[] }).words.filter(isWordEntry);
  return words;
}

/**
 * Resolve subtitle source params in-place.
 *
 * After this runs, every subtitle clip has params.source === { words: [...] }.
 * Pass-through for Mode C (already words). Mode A/B read filesystem.
 */
export function resolveSubtitleSources(
  tracks: ResolvedTrack[],
  opts?: SubtitleResolverOpts,
): void {
  const strict = opts?.strict === true;
  const log = opts?.log ?? ((msg: string) => { console.warn(msg); });
  // Late-require node:fs so callers can inject (e.g. tests). Using
  // createRequire would need import.meta.url; we opt for dynamic access via
  // globalThis to stay type-safe under strict TS.
  const fs = opts?.fs ?? {
    readFileSync: (p: string, enc: 'utf8') => nodeReadFileSync(p, enc),
    existsSync: (p: string) => nodeExistsSync(p),
  };

  // Build audio track index once: trackId -> first clip's params.src (the mp3 path).
  // Audio Track ABI: params.src is a required string (file:// or data:).
  const audioSrcByTrackId = new Map<string, string>();
  for (const t of tracks) {
    if (t.kind !== 'audio') continue;
    // Pick first clip that has a string src (audio tracks typically have one clip).
    for (const c of t.clips) {
      const src = (c.params as Record<string, unknown>).src;
      if (typeof src === 'string' && src.length > 0) {
        audioSrcByTrackId.set(t.id, src);
        break;
      }
    }
  }

  for (const track of tracks) {
    if (track.kind !== 'subtitle') continue;
    for (const clip of track.clips) {
      resolveClip(clip, audioSrcByTrackId, strict, log, fs);
    }
  }
}

function resolveClip(
  clip: ResolvedClip,
  audioSrcByTrackId: Map<string, string>,
  strict: boolean,
  log: (msg: string) => void,
  fs: NonNullable<SubtitleResolverOpts['fs']>,
): void {
  const params = clip.params as Record<string, unknown>;
  const source = params.source as Record<string, unknown> | undefined;
  if (!source || typeof source !== 'object') {
    // Schema validator should have caught this earlier; fill empty to be safe.
    params.source = { words: [] };
    return;
  }

  // Mode C: already inline words[] -> pass through (but normalise shape).
  if (Array.isArray(source.words)) {
    const words = source.words.filter(isWordEntry);
    params.source = { words };
    return;
  }

  // Mode A: audio_track_id -> look up track, derive timeline path, read words.
  if (typeof source.audio_track_id === 'string') {
    const audioTrackId = source.audio_track_id;
    const audioSrc = audioSrcByTrackId.get(audioTrackId);
    if (!audioSrc) {
      const msg = `subtitle clip '${clip.id}' references audio_track_id='${audioTrackId}' but no audio track with that id found (or track has no src)`;
      if (strict) {
        throw subtitleError('E_SUBTITLE_SOURCE_MISSING', msg, `Add an audio track with id='${audioTrackId}' or switch to timeline_path / words.`, clip.id);
      }
      log(`[subtitle-resolver] ${msg}`);
      params.source = { words: [] };
      return;
    }
    const audioPath = fileUrlToPath(audioSrc);
    const timelinePath = deriveTimelinePath(audioPath);
    readAndAssign(clip, params, timelinePath, strict, log, fs);
    return;
  }

  // Mode B: timeline_path -> read file directly.
  if (typeof source.timeline_path === 'string') {
    const timelinePath = fileUrlToPath(source.timeline_path);
    readAndAssign(clip, params, timelinePath, strict, log, fs);
    return;
  }

  // Unknown shape (schema should have caught) -> empty words.
  const msg = `subtitle clip '${clip.id}' has unrecognised source shape; expected audio_track_id | timeline_path | words`;
  if (strict) {
    throw subtitleError('E_SUBTITLE_SOURCE_SHAPE', msg, 'Use one of audio_track_id / timeline_path / words.', clip.id);
  }
  log(`[subtitle-resolver] ${msg}`);
  params.source = { words: [] };
}

function readAndAssign(
  clip: ResolvedClip,
  params: Record<string, unknown>,
  timelinePath: string,
  strict: boolean,
  log: (msg: string) => void,
  fs: NonNullable<SubtitleResolverOpts['fs']>,
): void {
  if (!fs.existsSync(timelinePath)) {
    const msg = `subtitle clip '${clip.id}' timeline file not found: ${timelinePath}`;
    if (strict) {
      throw subtitleError('E_SUBTITLE_TIMELINE_MISSING', msg, 'Ensure timeline JSON exists at sibling of audio (basename.timeline.json) or provide timeline_path.', clip.id);
    }
    log(`[subtitle-resolver] ${msg}`);
    params.source = { words: [] };
    return;
  }
  let text: string;
  try {
    text = fs.readFileSync(timelinePath, 'utf8');
  } catch (e) {
    const msg = `subtitle clip '${clip.id}' timeline read failed at ${timelinePath}: ${e instanceof Error ? e.message : String(e)}`;
    if (strict) {
      throw subtitleError('E_SUBTITLE_TIMELINE_READ', msg, 'Check file permissions and path.', clip.id);
    }
    log(`[subtitle-resolver] ${msg}`);
    params.source = { words: [] };
    return;
  }
  const words = parseTimelineWords(text, timelinePath, strict, log, clip.id);
  params.source = { words };
}
