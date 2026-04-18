// Stage 3: bundle.
// Input: Resolved + track sources (id -> src string) + runtime source string + optional assets.
// Output: single-file bundle.html (UTF-8 string), byte-stable (idempotent).
// No timestamps, no Math.random, no ordering drift.

import { Resolved, StageError, StageErrorException } from './types.js';

export interface BundleInput {
  resolved: Resolved;
  trackSources: Record<string, string>;
  runtimeJs: string;
  assets?: Record<string, Uint8Array>;
  pretty?: boolean;
}

function bundleError(code: string, message: string, fix_hint?: string): StageErrorException {
  const err: StageError = { stage: 'bundle', code, message };
  if (fix_hint !== undefined) err.fix_hint = fix_hint;
  return new StageErrorException(err);
}

// Escape text so it is safe to place inside <script>...</script>.
// Must escape '</' to prevent premature script termination.
function escapeForScript(s: string): string {
  return s
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\!--')
    .replace(/]]>/g, ']]\\u003E');
}

function sortedJsonStringify(value: unknown, pretty: boolean): string {
  // Deterministic stringify: sort object keys recursively.
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      const keys = Object.keys(v as object).sort();
      for (const k of keys) out[k] = sortKeys((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortKeys(value), null, pretty ? 2 : 0);
}

export function bundle(input: BundleInput): string {
  if (typeof input.runtimeJs !== 'string') {
    throw bundleError('E_RUNTIME_MISSING', 'runtimeJs must be a string', 'Provide runtime source or placeholder.');
  }
  for (const track of input.resolved.tracks) {
    if (!(track.id in input.trackSources)) {
      throw bundleError(
        'E_TRACK_SRC_MISSING',
        `track source not provided for id='${track.id}'`,
        'Include every Track id in trackSources map.',
      );
    }
  }

  // Sort trackSources by key for determinism.
  const sortedTrackSources: Record<string, string> = {};
  for (const k of Object.keys(input.trackSources).sort()) {
    sortedTrackSources[k] = input.trackSources[k]!;
  }

  // Assets (base64 inline). Optional in v1.1.
  const sortedAssets: Record<string, string> = {};
  if (input.assets) {
    for (const k of Object.keys(input.assets).sort()) {
      const bytes = input.assets[k]!;
      sortedAssets[k] = Buffer.from(bytes).toString('base64');
    }
  }

  const resolvedJson = sortedJsonStringify(input.resolved, input.pretty ?? false);
  const trackSourcesJson = sortedJsonStringify(sortedTrackSources, input.pretty ?? false);
  const assetsJson = sortedJsonStringify(sortedAssets, input.pretty ?? false);

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>NextFrame bundle</title>',
    '<style>html,body{margin:0;background:#000;overflow:hidden}#nf-stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}</style>',
    '</head>',
    '<body>',
    '<div id="nf-stage"></div>',
    `<script id="nf-resolved" type="application/json">${escapeForScript(resolvedJson)}</script>`,
    `<script id="nf-tracks" type="application/json">${escapeForScript(trackSourcesJson)}</script>`,
    `<script id="nf-assets" type="application/json">${escapeForScript(assetsJson)}</script>`,
    `<script id="nf-runtime">${input.runtimeJs}</script>`,
    '<script>if(typeof window!=="undefined"&&typeof window.__nf_boot==="function"){window.__nf_boot();}</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');

  return html;
}
