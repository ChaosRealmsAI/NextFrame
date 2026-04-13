#!/usr/bin/env node
/**
 * NextFrame HTML Bundler
 *
 * Reads a timeline JSON + all scene/engine JS files → outputs a single self-contained HTML.
 *
 * Usage: node bundle.js timeline.json output.html
 */

const fs = require('fs');
const path = require('path');

const timelinePath = process.argv[2];
const outputPath = process.argv[3];

if (!timelinePath || !outputPath) {
  console.error('Usage: node bundle.js <timeline.json> <output.html>');
  process.exit(1);
}

const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
const srcDir = __dirname;
const coreDir = path.join(srcDir, 'core');

function getTimelineMetrics(input) {
  const project = input && typeof input.project === 'object' ? input.project : {};
  return {
    width: project.width || input.width || 1920,
    height: project.height || input.height || 1080,
    fps: project.fps || input.fps || 30,
    duration: input.duration || 10,
    background: input.background || '#05050c',
  };
}

function getTimelineLayers(input) {
  if (Array.isArray(input.layers)) {
    return input.layers;
  }
  const tracks = Array.isArray(input.tracks) ? input.tracks : [];
  const layers = [];
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex];
    const clips = Array.isArray(track && track.clips) ? track.clips : [];
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) {
      const clip = clips[clipIndex];
      layers.push({
        ...clip,
        id: clip && clip.id ? clip.id : `track-${trackIndex + 1}-clip-${clipIndex + 1}`,
        kind: clip && clip.kind ? clip.kind : (track && track.kind ? track.kind : 'video'),
        trackId: track && track.id ? track.id : `track-${trackIndex + 1}`,
      });
    }
  }
  return layers;
}

const layers = getTimelineLayers(timeline);

// Collect all needed scene IDs from timeline
const neededScenes = new Set();
for (const layer of layers) {
  if (layer.scene) neededScenes.add(layer.scene);
}

// Read shared utilities (strip ES module syntax)
function readAndStrip(filePath) {
  let code = fs.readFileSync(filePath, 'utf-8');
  // Remove import statements
  code = code.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
  code = code.replace(/^import\s*\{[^}]*\}\s*from\s+['"].*?['"];?\s*$/gm, '');
  // Remove export default
  code = code.replace(/^export\s+default\s+/gm, 'return ');
  // Remove export { ... }
  code = code.replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
  // Remove export from functions/const
  code = code.replace(/^export\s+(function|const|let|var|class)\s/gm, '$1 ');
  return code;
}

// Read shared utils
const sharedCode = readAndStrip(path.join(coreDir, 'scenes-v2-shared.js'));

// Read engine
const engineCode = [
  'easing.js',
  'layout.js',
  'render.js',
  'index.js',
].map((file) => readAndStrip(path.join(coreDir, 'engine', file))).join('\n\n');

// Read each scene file
const sceneDirV2 = fs.existsSync(path.join(srcDir, 'scenes-v2'))
  ? path.join(srcDir, 'scenes-v2')
  : path.join(srcDir, 'components');
const sceneCodesV2 = [];
for (const file of fs.readdirSync(sceneDirV2).filter(f => f.endsWith('.js') && f !== 'index.js')) {
  const id = file.replace('.js', '');
  if (!neededScenes.has(id)) continue;
  const code = readAndStrip(path.join(sceneDirV2, file));
  sceneCodesV2.push({ id, code });
}

// Legacy scenes/ dir removed in v0.3.1 — skip if missing
const sceneDirCanvas = path.join(srcDir, 'scenes');
const sceneCodesCanvas = [];
if (fs.existsSync(sceneDirCanvas)) {
  for (const file of fs.readdirSync(sceneDirCanvas).filter(f => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('_'))) {
    const id = file.replace('.js', '');
    if (!neededScenes.has(id)) continue;
    const code = readAndStrip(path.join(sceneDirCanvas, file));
    sceneCodesCanvas.push({ id, fnName: id, code });
  }
}

// Build the HTML
const { width, height, fps, duration } = getTimelineMetrics(timeline);
const customSceneIds = ['htmlSlide', 'svgOverlay', 'markdownSlide'].filter((id) => neededScenes.has(id));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${width}">
<title>NextFrame — Generated Video</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #111; margin: 0; height: 100vh; display: flex; flex-direction: column; align-items: center; overflow: hidden; }
  #nf-stage-wrap { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; width: 100%; }
  #nf-player { display: inline-block; }
  #nf-controls { width: 100%; max-width: 900px; margin: 0 auto; padding: 8px 16px; background: rgba(0,0,0,0.92); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; font: 13px -apple-system,sans-serif; color: #aaa; flex-shrink: 0; }
  .nf-layer { will-change: opacity, transform; }
</style>
</head>
<body>
<div id="nf-stage-wrap"><div id="nf-player"><div id="stage"></div></div></div>
<script>
// ===== Shared Utilities =====
${sharedCode}

// ===== Scene Components =====
const SCENE_REGISTRY = {};

function __nfResizeCanvas(state) {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const rect = state.container.getBoundingClientRect();
  const width = Math.max(1, Math.round((rect.width || state.container.clientWidth || ${width}) * dpr));
  const height = Math.max(1, Math.round((rect.height || state.container.clientHeight || ${height}) * dpr));
  if (state.canvas.width !== width || state.canvas.height !== height) {
    state.canvas.width = width;
    state.canvas.height = height;
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function __nfCreateCanvasScene(renderer) {
  return {
    type: 'canvas',
    create(container) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      container.appendChild(canvas);
      return { container, canvas, ctx: canvas.getContext('2d') };
    },
    update(state, t, params) {
      if (!state || !state.ctx) return;
      __nfResizeCanvas(state);
      const rect = state.container.getBoundingClientRect();
      state.ctx.clearRect(0, 0, rect.width || ${width}, rect.height || ${height});
      renderer(t, params || {}, state.ctx, t);
    },
    destroy(state) {
      if (state && state.canvas) state.canvas.remove();
    },
  };
}

function __nfTimelineSize() {
  const project = TIMELINE && TIMELINE.project ? TIMELINE.project : {};
  return {
    width: project.width || TIMELINE.width || ${width},
    height: project.height || TIMELINE.height || ${height},
  };
}

function __nfScaleStaticRoot(state) {
  const size = __nfTimelineSize();
  const rect = state.container.getBoundingClientRect();
  const scale = Math.min(
    rect.width > 0 ? rect.width / size.width : 1,
    rect.height > 0 ? rect.height / size.height : 1
  ) || 1;
  state.root.style.transform = 'scale(' + scale + ')';
}

function __nfCreateStaticScene(renderContent, extraStyle) {
  return {
    type: 'dom',
    create(container, params) {
      const size = __nfTimelineSize();
      const root = document.createElement('div');
      root.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;' + 'width:' + size.width + 'px;height:' + size.height + 'px;' + (extraStyle || '');
      root.innerHTML = renderContent(params || {});
      container.appendChild(root);
      const state = { container, root };
      __nfScaleStaticRoot(state);
      return state;
    },
    update(state) {
      __nfScaleStaticRoot(state);
    },
    destroy(state) {
      if (state && state.root) state.root.remove();
    },
  };
}

function __nfEscapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function __nfMarkdownToHtml(markdown) {
  const blocks = String(markdown == null ? '' : markdown).split(/\\n\\n+/);
  const codeFence = String.fromCharCode(96).repeat(3);
  const inlineCode = String.fromCharCode(96);
  return blocks.map((block) => {
    if (/^###\\s+/.test(block)) return '<h3>' + __nfEscapeHtml(block.replace(/^###\\s+/, '')) + '</h3>';
    if (/^##\\s+/.test(block)) return '<h2>' + __nfEscapeHtml(block.replace(/^##\\s+/, '')) + '</h2>';
    if (/^#\\s+/.test(block)) return '<h1>' + __nfEscapeHtml(block.replace(/^#\\s+/, '')) + '</h1>';
    if (block.indexOf(codeFence) === 0) return '<pre><code>' + __nfEscapeHtml(
      block
        .replace(new RegExp('^' + codeFence + '\\\\w*\\\\n?'), '')
        .replace(new RegExp(codeFence + '$'), '')
    ) + '</code></pre>';
    if (/^(?:-\\s+.+\\n?)+$/.test(block)) {
      const items = block.split(/\\n/).filter(Boolean).map((line) => '<li>' + __nfEscapeHtml(line.replace(/^-\\s+/, '')) + '</li>').join('');
      return '<ul>' + items + '</ul>';
    }
    return '<p>' + __nfEscapeHtml(block)
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(new RegExp(inlineCode + '([^' + inlineCode + ']+)' + inlineCode, 'g'), '<code>$1</code>')
      .replace(/\\n/g, '<br>') + '</p>';
  }).join('');
}

${sceneCodesV2.map(({ id, code }) => `
// --- ${id} ---
if (!SCENE_REGISTRY["${id}"]) SCENE_REGISTRY["${id}"] = (function() {
  ${code}
})();
`).join('\n')}

${sceneCodesCanvas.map(({ id, fnName, code }) => `
// --- ${id} (canvas wrapper) ---
if (!SCENE_REGISTRY["${id}"]) SCENE_REGISTRY["${id}"] = (function() {
  ${code}
  return __nfCreateCanvasScene(${fnName});
})();
`).join('\n')}

${customSceneIds.includes('htmlSlide') ? `
SCENE_REGISTRY["htmlSlide"] = __nfCreateStaticScene((params) => params && params.html ? String(params.html) : '', 'overflow:hidden;background:transparent;');
` : ''}
${customSceneIds.includes('svgOverlay') ? `
SCENE_REGISTRY["svgOverlay"] = __nfCreateStaticScene((params) => params && params.svg ? String(params.svg) : '', 'overflow:hidden;background:transparent;');
` : ''}
${customSceneIds.includes('markdownSlide') ? `
SCENE_REGISTRY["markdownSlide"] = __nfCreateStaticScene((params) => {
  return '<div style="width:100%;height:100%;padding:88px 108px;background:linear-gradient(180deg,#120f18 0%,#09070d 100%);color:#f5ece0;font:500 28px/1.55 Georgia,serif;overflow:hidden">' +
    __nfMarkdownToHtml(params && params.md ? params.md : '') +
    '</div>';
}, 'overflow:hidden;');
` : ''}

// ===== Engine =====
${engineCode}

// ===== Timeline Data =====
const TIMELINE = ${JSON.stringify(timeline, null, 2).replace(/<\//g, '<\\/')};

// ===== Boot =====
const stage = document.getElementById('stage');
const engine = createEngine(stage, TIMELINE, SCENE_REGISTRY);
const player = createPlayer(engine, stage);
window.__nfEngine = engine;

// ===== Fit stage to window (controls stay full size) =====
function fitPreview() {
  const sw = ${width}, sh = ${height};
  const player = document.getElementById('nf-player');
  if (!player) return;
  const controlsH = 52;
  const maxW = window.innerWidth * 0.95;
  const maxH = (window.innerHeight - controlsH - 16) * 0.98;
  const scale = Math.min(maxW / sw, maxH / sh, 1);
  player.style.zoom = scale;
}
fitPreview();
window.addEventListener('resize', fitPreview);
</script>
</body>
</html>
`;

fs.writeFileSync(outputPath, html, 'utf-8');
console.log(`Generated: ${outputPath} (${Math.round(html.length / 1024)}KB)`);
console.log(`Timeline: ${width}x${height} @ ${fps}fps, ${duration}s, ${layers.length} layers`);
console.log(`Scenes bundled: ${sceneCodesV2.length + sceneCodesCanvas.length + customSceneIds.length}`);
