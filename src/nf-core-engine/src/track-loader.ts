// Load Track .js file and invoke describe() to retrieve JSON Schema for params.
// Also reads raw source text for inlining into bundle.

import { readFileSync, existsSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { StageError, StageErrorException } from './types.js';
import type { TrackDescriptor } from './resolve.js';

// Try (a) cwd-relative, (b) walk upward from cwd until we hit '/' looking for path relative to each ancestor.
function resolveTrackPath(relativeSrc: string, cwdDir: string): string | null {
  const direct = pathResolve(cwdDir, relativeSrc);
  if (existsSync(direct)) return direct;
  // Walk up from cwdDir.
  let dir = cwdDir;
  while (dir !== '/' && dir !== '.') {
    const candidate = pathResolve(dir, relativeSrc);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveError(code: string, message: string, fix_hint?: string): StageErrorException {
  const err: StageError = { stage: 'resolve', code, message };
  if (fix_hint !== undefined) err.fix_hint = fix_hint;
  return new StageErrorException(err);
}

// Sandbox-exec a Track .js: zero imports, export describe/sample/render.
// We run it with `new Function('module','exports',src)()` pattern and read module.exports / exports.
export function executeTrackSrc(src: string, trackId: string): { describe?: () => TrackDescriptor; sample?: () => unknown; render?: (...a: unknown[]) => unknown } {
  // Transform ES module exports to CommonJS-style for exec.
  // Replace "export function X" -> "exports.X = function" etc.
  const transformed = src
    .replace(/export\s+function\s+([A-Za-z_$][\w$]*)/g, 'exports.$1 = function $1')
    .replace(/export\s+const\s+([A-Za-z_$][\w$]*)/g, 'exports.$1 = /* const */')
    .replace(/export\s+default\s+/g, 'exports.default = ');

  const exports: Record<string, unknown> = {};
  const module = { exports };
  try {
    const fn = new Function('module', 'exports', transformed);
    fn(module, exports);
  } catch (e) {
    throw resolveError('E_TRACK_EXEC', `track '${trackId}' failed to execute: ${e instanceof Error ? e.message : String(e)}`, 'Track must be pure ES module with exports.');
  }
  return exports as { describe?: () => TrackDescriptor; sample?: () => unknown; render?: (...a: unknown[]) => unknown };
}

export interface LoadedTrack {
  id: string;
  src: string;
  path: string;
  source_text: string;
  describe: TrackDescriptor | null;
}

export function loadTrack(relativeSrc: string, trackId: string, cwdDir: string): LoadedTrack {
  const fullPath = resolveTrackPath(relativeSrc, cwdDir);
  if (!fullPath) {
    throw resolveError('E_TRACK_READ', `cannot locate track '${trackId}' with src='${relativeSrc}' (searched ${cwdDir} and ancestors)`, 'Check path in source.json.');
  }
  let text: string;
  try {
    text = readFileSync(fullPath, 'utf8');
  } catch (e) {
    throw resolveError('E_TRACK_READ', `cannot read track '${trackId}' at ${fullPath}: ${e instanceof Error ? e.message : String(e)}`, 'Check path in source.json.');
  }
  const mod = executeTrackSrc(text, trackId);
  let describe: TrackDescriptor | null = null;
  if (typeof mod.describe === 'function') {
    try {
      describe = mod.describe() as TrackDescriptor;
    } catch (e) {
      throw resolveError('E_TRACK_DESCRIBE', `track '${trackId}' describe() threw: ${e instanceof Error ? e.message : String(e)}`, 'Ensure describe() is pure.');
    }
  }
  return {
    id: trackId,
    src: relativeSrc,
    path: fullPath,
    source_text: text,
    describe,
  };
}

export function loadTracksFor(tracks: { id: string; src: string }[], cwdDir: string): Map<string, LoadedTrack> {
  const out = new Map<string, LoadedTrack>();
  for (const t of tracks) out.set(t.id, loadTrack(t.src, t.id, cwdDir));
  return out;
}

export { dirname as _dirname };
