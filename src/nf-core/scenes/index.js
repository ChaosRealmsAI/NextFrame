// nf-core scene registry — auto-discovers scenes from {ratio}/{category}/{name}/index.js.
// Built-in scenes live in this directory; external user scenes may live in ~/NextFrame/scenes.
import { readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { runInNewContext } from "node:vm";
const SCENES_DIR = fileURLToPath(new URL(".", import.meta.url));
const EXTERNAL_SCENES_DIR = join(homedir(), "NextFrame", "scenes");
const LEGACY_BUNDLE_PATH = resolve(SCENES_DIR, "../../nf-runtime/web/src/components/scene-bundle.js");
const RATIO_DIRS = ["16x9", "9x16", "4x3"];
const REGISTRY = new Map();
let loaded = false;
function registryKey(meta) {
    return `${meta.ratio}:${meta.id}`;
}
async function discoverDir(baseDir, source) {
    for (const ratioDir of RATIO_DIRS) {
        const ratioPath = resolve(baseDir, ratioDir);
        if (!existsSync(ratioPath))
            continue;
        const themes = await readdir(ratioPath, { withFileTypes: true });
        for (const theme of themes) {
            if (!theme.isDirectory())
                continue;
            const themePath = join(ratioPath, theme.name);
            const themeEntries = await readdir(themePath, { withFileTypes: true });
            for (const entry of themeEntries) {
                // New flat layout: {ratio}/{theme}/{role-name}.js with default export object
                if (entry.isFile() && entry.name.endsWith(".js") && !entry.name.startsWith("_")) {
                    const filePath = join(themePath, entry.name);
                    try {
                        const mod = await import(pathToFileURL(filePath).href);
                        const c = mod.default;
                        if (!c || typeof c !== "object") continue;
                        if (!c.id || !c.ratio || typeof c.render !== "function") continue;
                        const key = registryKey(c);
                        if (REGISTRY.has(key)) continue;
                        REGISTRY.set(key, {
                            id: c.id,
                            render: c.render,
                            screenshots: undefined,
                            lint: undefined,
                            META: c,
                            path: join(ratioDir, theme.name, entry.name),
                            source,
                        });
                    } catch {
                        // Skip broken modules
                    }
                    continue;
                }
                if (!entry.isDirectory())
                    continue;
                // Legacy nested layout: {ratio}/{theme}/{category}/{scene}/index.js
                const categoryPath = join(themePath, entry.name);
                const scenes = await readdir(categoryPath, { withFileTypes: true });
                for (const sceneDir of scenes) {
                    if (!sceneDir.isDirectory())
                        continue;
                    const indexPath = join(categoryPath, sceneDir.name, "index.js");
                    if (!existsSync(indexPath))
                        continue;
                    try {
                        const mod = await import(pathToFileURL(indexPath).href);
                        if (!mod.meta || !mod.meta.id || !mod.meta.ratio || typeof mod.render !== "function")
                            continue;
                        const key = registryKey(mod.meta);
                        if (REGISTRY.has(key))
                            continue;
                        REGISTRY.set(key, {
                            id: mod.meta.id,
                            render: mod.render,
                            screenshots: mod.screenshots,
                            lint: mod.lint,
                            META: mod.meta,
                            path: join(ratioDir, theme.name, entry.name, sceneDir.name),
                            source,
                        });
                    }
                    catch {
                        // Skip broken scene modules so discovery can continue for the rest.
                    }
                }
            }
        }
    }
}
function loadLegacyBundleScenes() {
    if (!existsSync(LEGACY_BUNDLE_PATH))
        return;
    const sandbox = { window: { __scenes: {} } };
    runInNewContext(readFileSync(LEGACY_BUNDLE_PATH, "utf8"), sandbox);
    for (const [sceneId, scene] of Object.entries(sandbox.window.__scenes || {})) {
        const meta = scene.meta;
        const render = scene.render;
        if (!meta || !meta.id || !meta.ratio || typeof render !== "function")
            continue;
        REGISTRY.set(registryKey(meta), {
            id: sceneId,
            render,
            screenshots: scene.screenshots,
            lint: scene.lint,
            META: meta,
            path: "",
            source: "official",
        });
    }
}
async function discover() {
    if (loaded)
        return;
    loadLegacyBundleScenes();
    await discoverDir(SCENES_DIR, "official");
    if (existsSync(EXTERNAL_SCENES_DIR)) {
        await discoverDir(EXTERNAL_SCENES_DIR, "custom");
    }
    loaded = true;
}
export async function getScene(id) {
    await discover();
    if (REGISTRY.has(id))
        return REGISTRY.get(id) || null;
    for (const entry of REGISTRY.values()) {
        if (entry.id === id)
            return entry;
    }
    return null;
}
export async function listScenes() {
    await discover();
    return [...REGISTRY.values()].map((entry) => ({
        ...(entry.META || {}),
        source: entry.source,
    }));
}
export async function listScenesForRatio(ratioId) {
    await discover();
    return [...REGISTRY.values()]
        .filter((entry) => entry.META?.ratio === ratioId)
        .map((entry) => ({
        ...(entry.META || {}),
        source: entry.source,
    }));
}
export async function getRegistry() {
    await discover();
    return REGISTRY;
}
export { REGISTRY };
