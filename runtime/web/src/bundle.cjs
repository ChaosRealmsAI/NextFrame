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

// Collect all needed scene IDs from timeline
const neededScenes = new Set();
for (const layer of (timeline.layers || [])) {
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
const sharedCode = readAndStrip(path.join(srcDir, 'scenes-v2-shared.js'));

// Read engine
const engineCode = readAndStrip(path.join(srcDir, 'engine-v2.js'));

// Read each scene file
const sceneDir = path.join(srcDir, 'scenes-v2');
const sceneFiles = fs.readdirSync(sceneDir).filter(f => f.endsWith('.js') && f !== 'index.js');
const sceneCodes = [];
for (const file of sceneFiles) {
  const id = file.replace('.js', '');
  const code = readAndStrip(path.join(sceneDir, file));
  sceneCodes.push({ id, code });
}

// Build the HTML
const { width = 1920, height = 1080, fps = 30, duration = 10, background = '#05050c' } = timeline;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NextFrame — Generated Video</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #111; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding-top: 20px; }
  #stage { box-shadow: 0 0 80px rgba(100,80,200,0.15); }
  .nf-layer { will-change: opacity, transform; }
</style>
</head>
<body>
<div id="stage"></div>
<script>
// ===== Shared Utilities =====
${sharedCode}

// ===== Scene Components =====
const SCENE_REGISTRY = {};

${sceneCodes.map(({ id, code }) => `
// --- ${id} ---
SCENE_REGISTRY["${id}"] = (function() {
  ${code}
})();
`).join('\n')}

// ===== Engine =====
${engineCode}

// ===== Timeline Data =====
const TIMELINE = ${JSON.stringify(timeline, null, 2)};

// ===== Boot =====
const stage = document.getElementById('stage');
const engine = createEngine(stage, TIMELINE, SCENE_REGISTRY);
const player = createPlayer(engine, stage);
</script>
</body>
</html>
`;

fs.writeFileSync(outputPath, html, 'utf-8');
console.log(`Generated: ${outputPath} (${Math.round(html.length / 1024)}KB)`);
console.log(`Timeline: ${width}x${height} @ ${fps}fps, ${duration}s, ${timeline.layers.length} layers`);
console.log(`Scenes bundled: ${sceneCodes.length}`);
