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
    `<style>${INLINE_CSS}</style>`,
    '</head>',
    '<body>',
    '<div class="stage-wrap">',
    '<div id="nf-stage"></div>',
    '</div>',
    '<div class="controls">',
    '<button data-nf="to-start" title="到头">⏮</button>',
    '<button data-nf="prev-frame" title="上一帧">⏪</button>',
    '<button data-nf="play-pause" title="播放/暂停">▶</button>',
    '<button data-nf="next-frame" title="下一帧">⏩</button>',
    '<button data-nf="to-end" title="到尾">⏭</button>',
    '<span class="timecode"><span class="now">00:00.000</span><span class="dur"> / 00:00.000</span></span>',
    '<div class="spacer"></div>',
    '<button data-nf="loop-toggle" data-active="false" title="循环">🔁 loop</button>',
    '</div>',
    '<div class="timeline">',
    '<div class="ruler"></div>',
    '<div class="tracks">',
    '<div class="playhead">',
    '<div class="ph-triangle"></div>',
    '<div class="ph-line"></div>',
    '<div class="ph-label">0.000s</div>',
    '</div>',
    '</div>',
    '</div>',
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

// ADR-037 layout tokens + ADR-036 no-truncation rules.
// Byte-stable: template literal is a constant — no timestamps / randomness.
const INLINE_CSS = [
  ':root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#e6edf3;--text-sub:#8b949e;',
  '--primary:#58a6ff;--purple:#bc8cff;--success:#3fb950;',
  '--primary-bg:rgba(88,166,255,0.18);--purple-bg:rgba(188,140,255,0.18);',
  '--success-bg:rgba(63,185,80,0.12);}',
  '*{box-sizing:border-box}',
  '/* NO OVERFLOW: ADR-036 — body min-height:100vh, no overflow:hidden */',
  'html,body{margin:0;padding:0;background:var(--bg);color:var(--text);',
  'font-family:-apple-system,BlinkMacSystemFont,"SF Pro SC","PingFang SC",sans-serif;',
  'font-size:14px;min-height:100vh;overflow-x:hidden}',
  'body{display:flex;flex-direction:column}',
  '.stage-wrap{flex:0 0 70vh;position:relative;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}',
  '#nf-stage{position:relative;width:100%;height:100%}',
  '#nf-stage > *{position:absolute;inset:0}',
  '.controls{flex:0 0 48px;display:flex;align-items:center;gap:10px;padding:0 16px;',
  'background:var(--card);border-top:1px solid var(--border)}',
  '.controls button{width:34px;height:34px;display:flex;align-items:center;justify-content:center;',
  'background:transparent;border:1px solid var(--border);color:var(--text-sub);',
  'border-radius:6px;font-size:14px;cursor:pointer;transition:all 0.12s;padding:0}',
  '.controls button:hover{background:rgba(255,255,255,0.04);color:var(--text)}',
  '.controls button[data-nf="play-pause"]{background:var(--primary-bg);color:var(--primary);border-color:var(--primary)}',
  '.controls button[data-nf="loop-toggle"][data-active="true"]{background:var(--success-bg);color:var(--success);border-color:var(--success);width:auto;padding:0 12px;font-size:12px;font-weight:600}',
  '.controls button[data-nf="loop-toggle"][data-active="false"]{width:auto;padding:0 12px;font-size:12px}',
  '.controls .timecode{font-family:"SF Mono",Menlo,monospace;font-size:13px;color:var(--text);margin-left:8px}',
  '.controls .timecode .now{color:var(--purple);font-weight:700}',
  '.controls .timecode .dur{color:var(--text-sub)}',
  '.controls .spacer{flex:1}',
  '/* NO OVERFLOW: ADR-036 — .timeline flex:1 1 auto, no max-height, overflow:visible */',
  '.timeline{flex:1 1 auto;min-height:160px;padding:14px 16px;background:var(--bg);',
  'border-top:1px solid rgba(255,255,255,0.05);overflow:visible}',
  '.ruler{position:relative;height:24px;margin:0 0 6px 140px;',
  'font-family:"SF Mono",Menlo,monospace;font-size:10px;color:rgba(255,255,255,0.45)}',
  '.ruler-tick{position:absolute;top:0;width:1px;height:7px;background:rgba(255,255,255,0.12)}',
  '.ruler-tick.major{height:11px;background:rgba(255,255,255,0.25)}',
  '.ruler-label{position:absolute;top:13px;transform:translateX(-50%)}',
  '/* NO OVERFLOW: ADR-036 — .tracks / .track-row must NOT set overflow:hidden|scroll|auto */',
  '.tracks{position:relative}',
  '.track-row{display:grid;grid-template-columns:140px 1fr;align-items:center;gap:0;margin-bottom:5px;height:40px}',
  '.track-label{font-family:"SF Mono",Menlo,monospace;font-size:12px;color:var(--text-sub);padding-right:12px}',
  '.track-lane{position:relative;height:40px;background:#0a0e14;border-radius:5px;border:1px solid rgba(255,255,255,0.06)}',
  '.clip{position:absolute;top:3px;bottom:3px;display:flex;flex-direction:column;justify-content:center;',
  'padding:0 10px;border-radius:3px;font-family:"SF Mono",Menlo,monospace;font-size:11px;overflow:hidden;',
  'background:var(--primary-bg);border:1px solid var(--primary);color:var(--primary)}',
  '.clip b{font-size:12px;color:inherit}',
  '.clip span{font-size:9px;opacity:0.7;margin-top:2px}',
  '.playhead{position:absolute;top:0;bottom:0;left:140px;width:0;z-index:10;cursor:ew-resize}',
  '.ph-line{position:absolute;top:0;bottom:0;width:2px;background:var(--purple);',
  'box-shadow:0 0 6px var(--purple);transform:translateX(-1px)}',
  '.ph-triangle{position:absolute;top:-4px;width:0;height:0;transform:translateX(-7px);',
  'border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid var(--purple)}',
  '.ph-label{position:absolute;top:-22px;transform:translateX(-50%);background:var(--purple);color:#0d1117;',
  'font-family:"SF Mono",Menlo,monospace;font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;white-space:nowrap}',
].join('');
