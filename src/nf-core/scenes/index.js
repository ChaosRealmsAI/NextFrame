// nf-core scene registry — auto-discovers scenes from {ratio}/{category}/{name}/index.js
// Built-in scenes from this directory; external user scenes from ~/NextFrame/scenes/.
// Used by CLI (via scene-registry.js) and engine.

import { readdir } from "fs/promises";
import { resolve, join } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { existsSync } from "fs";
import { homedir } from "os";

const SCENES_DIR = new URL(".", import.meta.url).pathname;
const EXTERNAL_SCENES_DIR = join(homedir(), "NextFrame", "scenes");
const RATIO_DIRS = ["16x9", "9x16", "4x3"];
const RATIO_MAP = { "16x9": "16:9", "9x16": "9:16", "4x3": "4:3" };

const _registry = new Map();
let _loaded = false;

async function discoverDir(baseDir, source) {
  for (const ratioDir of RATIO_DIRS) {
    const ratioPath = resolve(baseDir, ratioDir);
    if (!existsSync(ratioPath)) continue;

    const categories = await readdir(ratioPath, { withFileTypes: true });
    for (const cat of categories) {
      if (!cat.isDirectory()) continue;
      const catPath = join(ratioPath, cat.name);
      const scenes = await readdir(catPath, { withFileTypes: true });

      for (const sc of scenes) {
        if (!sc.isDirectory()) continue;
        const indexPath = join(catPath, sc.name, "index.js");
        if (!existsSync(indexPath)) continue;

        try {
          const mod = await import(pathToFileURL(indexPath).href);
          if (!mod.meta || !mod.render) continue;
          const entry = {
            id: mod.meta.id,
            render: mod.render,
            screenshots: mod.screenshots,
            lint: mod.lint,
            META: mod.meta,
            path: join(ratioDir, cat.name, sc.name),
            source,
          };
          _registry.set(mod.meta.id, entry);
        } catch (e) {
          // skip broken scenes silently
        }
      }
    }
  }
}

async function discover() {
  if (_loaded) return;
  // Built-in scenes first, then external (external overrides built-in on ID conflict)
  await discoverDir(SCENES_DIR, "official");
  if (existsSync(EXTERNAL_SCENES_DIR)) {
    await discoverDir(EXTERNAL_SCENES_DIR, "custom");
  }
  _loaded = true;
}

export async function getScene(id) {
  await discover();
  return _registry.get(id) || null;
}

export async function listScenes() {
  await discover();
  return [..._registry.values()].map((s) => ({ ...s.META, source: s.source }));
}

export async function listScenesForRatio(ratioId) {
  await discover();
  return [..._registry.values()]
    .filter((s) => s.META.ratio === ratioId)
    .map((s) => ({ ...s.META, source: s.source }));
}

export async function getRegistry() {
  await discover();
  return _registry;
}

/**
 * Resolve final params for a scene: defaults < theme < userParams.
 * @param {string} sceneId
 * @param {string|null} theme  - theme key from meta.themes, or null
 * @param {object} userParams  - caller-supplied overrides
 * @returns {object} merged params
 */
export async function resolveParams(sceneId, theme, userParams = {}) {
  await discover();
  const entry = _registry.get(sceneId);
  if (!entry) return { ...userParams };

  const meta = entry.META;

  // 1. Collect defaults from meta.params
  const defaults = {};
  if (meta.params) {
    for (const [k, v] of Object.entries(meta.params)) {
      if (v.default !== undefined) defaults[k] = v.default;
    }
  }

  // 2. Overlay theme values if theme exists
  const themeValues = (theme && meta.themes && meta.themes[theme]) ? meta.themes[theme] : {};

  // 3. Overlay userParams on top
  return { ...defaults, ...themeValues, ...userParams };
}

// Sync access after first discover (for backwards compat)
export const REGISTRY = _registry;
