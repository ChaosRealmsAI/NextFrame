// Stage 3: bundle.
// Input: Resolved + track sources (id -> src string) + runtime source string + optional assets.
// Output: single-file bundle.html (UTF-8 string), byte-stable (idempotent).
// No timestamps, no Math.random, no ordering drift.
//
// v1.35 ADR-046 supersedes ADR-037: stage uses aspect-ratio preserving layout,
// timeline becomes scrollable (keeps ADR-036 no-truncation by scroll not by grow).

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

// ADR-046: map "W:H" to CSS aspect-ratio "W / H". Defaults to 16 / 9 on bad input.
function buildAspectCss(ratio: string): { css: string; num: string } {
  const m = /^(\d+):(\d+)$/.exec(String(ratio || ''));
  if (!m) return { css: '16 / 9', num: '1.7778' };
  const w = Number(m[1]); const h = Number(m[2]);
  return { css: `${m[1]} / ${m[2]}`, num: (w / h).toFixed(4) };
}

// ADR-046 round 2: Tracks render with viewport pixel sizes (e.g. width:1920px).
// Stage box is smaller — we scale the Track content down to fit without distortion.
function buildViewportPx(w: number, h: number): { vw: string; vh: string } {
  const vw = Number.isFinite(w) && w > 0 ? Math.round(w) : 1920;
  const vh = Number.isFinite(h) && h > 0 ? Math.round(h) : 1080;
  return { vw: `${vw}px`, vh: `${vh}px` };
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

  // ADR-046: inject --nf-aspect (CSS aspect-ratio) + --nf-aspect-num (decimal) +
  // --nf-vw / --nf-vh (logical viewport pixel size) so the stage CSS can both
  // preserve aspect-ratio AND scale Track-rendered content (which uses viewport px).
  const aspect = buildAspectCss(input.resolved.viewport.ratio);
  const vp = buildViewportPx(input.resolved.viewport.w, input.resolved.viewport.h);
  const rootVars = `:root{--nf-aspect:${aspect.css};--nf-aspect-num:${aspect.num};--nf-vw:${vp.vw};--nf-vh:${vp.vh};}`;

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>NextFrame bundle</title>',
    `<style>${rootVars}${INLINE_CSS}</style>`,
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
    '<button data-nf="timeline-toggle" data-active="true" title="折叠时间轴">▼ timeline</button>',
    '<button data-nf="loop-toggle" data-active="false" title="循环">🔁 loop</button>',
    '</div>',
    '<div class="timeline" data-nf-tl="open">',
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
    '<script>if(typeof window!=="undefined"&&typeof window.__nf_boot==="function"){window.__nf_boot();}' +
      // ADR-046 inline mini-controller for timeline toggle (no runtime change needed).
      'document.addEventListener("click",function(e){var b=e.target&&e.target.closest&&e.target.closest("[data-nf=\\"timeline-toggle\\"]");' +
      'if(!b)return;var tl=document.querySelector(".timeline");if(!tl)return;' +
      'var open=tl.getAttribute("data-nf-tl")!=="closed";' +
      'if(open){tl.setAttribute("data-nf-tl","closed");b.textContent="▲ timeline";b.setAttribute("data-active","false");}' +
      'else{tl.setAttribute("data-nf-tl","open");b.textContent="▼ timeline";b.setAttribute("data-active","true");}});' +
      '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');

  return html;
}

// ADR-046 layout tokens (supersedes ADR-037) + ADR-036 no-truncation (via scroll).
// Byte-stable: template literal is a constant — no timestamps / randomness.
const INLINE_CSS = [
  // base tokens (wrapped in :root block; --nf-aspect is injected via a separate :root block at runtime)
  ':root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#e6edf3;--text-sub:#8b949e;',
  '--primary:#58a6ff;--purple:#bc8cff;--success:#3fb950;',
  '--primary-bg:rgba(88,166,255,0.18);--purple-bg:rgba(188,140,255,0.18);',
  '--success-bg:rgba(63,185,80,0.12);}',
  '*{box-sizing:border-box}',
  // body: height:100vh (was min-height) so flex children can split the viewport.
  'html,body{margin:0;padding:0;background:var(--bg);color:var(--text);',
  'font-family:-apple-system,BlinkMacSystemFont,"SF Pro SC","PingFang SC",sans-serif;',
  'font-size:14px;height:100vh;overflow:hidden}',
  'body{display:flex;flex-direction:column}',
  // ADR-046: stage-wrap is the sizing container for #nf-stage.
  // Using `container-type: size` lets the stage size itself off the wrap using cqw/cqh,
  // which is stable in headless chromium (unlike aspect-ratio + flex which can collapse).
  '.stage-wrap{flex:1 1 auto;min-height:0;position:relative;background:#000;',
  'display:flex;align-items:center;justify-content:center;padding:12px;overflow:hidden;',
  'container-type:size}',
  // #nf-stage width is min(container width, container height * aspect ratio) — the classic
  // contain formula. This is equivalent to object-fit:contain but for a div. aspect-ratio
  // sets height from the computed width. `container-type:size` here lets children scale
  // off #nf-stage's resolved pixel size via container queries.
  '#nf-stage{position:relative;aspect-ratio:var(--nf-aspect);',
  'width:min(100cqw - 24px, (100cqh - 24px) * var(--nf-aspect-num));',
  'height:auto;background:#050507;container-type:size}',
  // Track-rendered children use viewport pixel sizes (e.g. width:1920px). We scale them
  // to fit the actual stage box: scale = stage_width / viewport_width. transform-origin
  // top-left keeps positioning stable. !important is required to beat Track inline
  // transforms (e.g. scene.js breathe effect 1.008); the cosmetic breathe loss is
  // acceptable to keep viewport fit correct. Inline width/height:1920px stays; we only
  // scale the rendered box visually. Content using % inside the Track is unaffected.
  '#nf-stage > *{position:absolute !important;top:0 !important;left:0 !important;',
  'transform-origin:top left !important;',
  'transform:scale(calc(100cqw / var(--nf-vw))) !important}',
  // controls row (unchanged 48px fixed).
  '.controls{flex:0 0 48px;display:flex;align-items:center;gap:10px;padding:0 16px;',
  'background:var(--card);border-top:1px solid var(--border);z-index:2}',
  '.controls button{width:34px;height:34px;display:flex;align-items:center;justify-content:center;',
  'background:transparent;border:1px solid var(--border);color:var(--text-sub);',
  'border-radius:6px;font-size:14px;cursor:pointer;transition:all 0.12s;padding:0}',
  '.controls button:hover{background:rgba(255,255,255,0.04);color:var(--text)}',
  '.controls button[data-nf="play-pause"]{background:var(--primary-bg);color:var(--primary);border-color:var(--primary)}',
  '.controls button[data-nf="loop-toggle"][data-active="true"]{background:var(--success-bg);color:var(--success);border-color:var(--success);width:auto;padding:0 12px;font-size:12px;font-weight:600}',
  '.controls button[data-nf="loop-toggle"][data-active="false"]{width:auto;padding:0 12px;font-size:12px}',
  '.controls button[data-nf="timeline-toggle"]{width:auto;padding:0 12px;font-size:12px;color:var(--text-sub)}',
  '.controls button[data-nf="timeline-toggle"][data-active="false"]{opacity:0.6}',
  '.controls .timecode{font-family:"SF Mono",Menlo,monospace;font-size:13px;color:var(--text);margin-left:8px}',
  '.controls .timecode .now{color:var(--purple);font-weight:700}',
  '.controls .timecode .dur{color:var(--text-sub)}',
  '.controls .spacer{flex:1}',
  // ADR-046: timeline now fixed-max with scroll (keeps ADR-036 no-truncation via overflow-y:auto, not flex-grow).
  '.timeline{flex:0 0 auto;max-height:30vh;min-height:0;overflow-y:auto;overflow-x:auto;',
  'padding:14px 16px;background:var(--bg);border-top:1px solid rgba(255,255,255,0.05);',
  'transition:max-height 0.2s ease-out}',
  // collapsed state hides the timeline content; scroll and max-height both go to 0.
  '.timeline[data-nf-tl="closed"]{max-height:0;padding-top:0;padding-bottom:0;overflow:hidden}',
  '.ruler{position:relative;height:24px;margin:0 0 6px 140px;',
  'font-family:"SF Mono",Menlo,monospace;font-size:10px;color:rgba(255,255,255,0.45)}',
  '.ruler-tick{position:absolute;top:0;width:1px;height:7px;background:rgba(255,255,255,0.12)}',
  '.ruler-tick.major{height:11px;background:rgba(255,255,255,0.25)}',
  '.ruler-label{position:absolute;top:13px;transform:translateX(-50%)}',
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
