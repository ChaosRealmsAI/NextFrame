// engine-v2/build.js — bundle timeline + scenes into single self-contained HTML.
// ESM refactor of runtime/web/src/bundle.cjs.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, '../../../runtime/web/src');

/** Strip ES module syntax so code can be embedded in a <script> tag */
function stripESM(code) {
  return code
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')
    .replace(/^import\s*\{[^}]*\}\s*from\s+['"].*?['"];?\s*$/gm, '')
    .replace(/^export\s+default\s+/gm, 'return ')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+(function|const|let|var|class)\s/gm, '$1 ');
}

export function buildHTML(timeline, outputPath) {
  try {
    // Read shared utilities
    const sharedCode = stripESM(readFileSync(resolve(SRC_DIR, 'scenes-v2-shared.js'), 'utf-8'));

    // Read engine
    const engineCode = stripESM(readFileSync(resolve(SRC_DIR, 'engine-v2.js'), 'utf-8'));

    // Read all scene files
    const sceneDir = resolve(SRC_DIR, 'scenes-v2');
    const sceneFiles = readdirSync(sceneDir).filter(f => f.endsWith('.js') && f !== 'index.js');
    const sceneCodes = [];
    for (const file of sceneFiles) {
      const id = file.replace('.js', '');
      const code = stripESM(readFileSync(resolve(sceneDir, file), 'utf-8'));
      sceneCodes.push({ id, code });
    }

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

    writeFileSync(outputPath, html, 'utf-8');
    const size = Math.round(html.length / 1024);
    return {
      ok: true,
      value: {
        path: outputPath,
        size: `${size}KB`,
        dimensions: `${width}x${height}`,
        fps,
        duration: `${duration}s`,
        layers: timeline.layers.length,
        scenes: sceneCodes.length,
      },
    };
  } catch (err) {
    return { ok: false, error: { code: 'BUILD_FAIL', message: err.message } };
  }
}
