// engine-v2/registry.js — parse scene metadata from runtime/web/src/components/*.js
// CLI runs in Node.js, cannot execute DOM scene code. Regex extraction only.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = resolve(HERE, '../../../../nf-runtime/web/src/components');

const REGISTRY = new Map();

function parseSceneFile(filePath) {
  const code = readFileSync(filePath, 'utf-8');
  const id = code.match(/id:\s*["']([^"']+)["']/)?.[1];
  const type = code.match(/type:\s*["']([^"']+)["']/)?.[1];
  const name = code.match(/name:\s*["']([^"']+)["']/)?.[1];
  const category = code.match(/category:\s*["']([^"']+)["']/)?.[1];
  const ratio = code.match(/ratio:\s*["']([^"']+)["']/)?.[1] || null;
  // Extract defaultParams object (simplified — handles single-level objects)
  const dpMatch = code.match(/defaultParams:\s*(\{[^}]+\})/s);
  let defaultParams = {};
  if (dpMatch) {
    try {
      // Convert JS object literal to JSON: unquoted keys → quoted, single quotes → double
      const jsonish = dpMatch[1]
        .replace(/(\w+)\s*:/g, '"$1":')
        .replace(/'/g, '"')
        .replace(/,\s*}/g, '}');
      defaultParams = JSON.parse(jsonish);
    } catch {
      // Complex defaultParams (arrays, nested) — leave empty, not critical for CLI
    }
  }
  return id ? { id, type: type || 'unknown', name: name || id, category: category || 'Other', ratio, defaultParams, file: filePath } : null;
}

// Load all scenes at import time
try {
  const files = readdirSync(SCENES_DIR).filter(f => f.endsWith('.js') && f !== 'index.js');
  for (const file of files) {
    const meta = parseSceneFile(resolve(SCENES_DIR, file));
    if (meta) REGISTRY.set(meta.id, meta);
  }
} catch {
  // SCENES_DIR may not exist in test environments — REGISTRY stays empty
}

export { REGISTRY };
export function listScenes() { return [...REGISTRY.values()]; }
export function getScene(id) { return REGISTRY.get(id) || null; }
