// Preview bundle builder — assembles scene + runtime into a single-file HTML for preview
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCENES_DIR = path.join(ROOT, "scenes");
const DESIGN_PATH = path.join(SCENES_DIR, "shared", "design.js");

function fail(message: any) {
  throw new Error(`failed to bundle preview scenes: ${message}. Fix: verify the timeline JSON references scenes that exist under src/nf-core/scenes.`);
}

function normalizeRatio(timeline: any) {
  if (timeline && typeof timeline.ratio === "string") {
    return timeline.ratio.replace(":", "x");
  }
  const width = Number(timeline?.width || timeline?.project?.width);
  const height = Number(timeline?.height || timeline?.project?.height);
  if (width > 0 && height > 0) {
    return width >= height ? "16x9" : "9x16";
  }
  return null;
}

function extractSceneIds(timeline: any) {
  const layers = Array.isArray(timeline?.layers) ? timeline.layers : (Array.isArray(timeline?.clips) ? timeline.clips : []);
  return [...new Set(layers.map((layer: any) => layer?.scene).filter(Boolean))];
}

async function buildSceneIndex() {
  const ratios = await fs.readdir(SCENES_DIR, { withFileTypes: true });
  const index = new Map();
  for (const ratio of ratios) {
    if (!ratio.isDirectory() || ratio.name === "shared") continue;
    const ratioPath = path.join(SCENES_DIR, ratio.name);
    const categories = await fs.readdir(ratioPath, { withFileTypes: true });
    for (const category of categories) {
      if (!category.isDirectory()) continue;
      const categoryPath = path.join(ratioPath, category.name);
      const scenes = await fs.readdir(categoryPath, { withFileTypes: true });
      for (const scene of scenes) {
        if (!scene.isDirectory()) continue;
        const indexPath = path.join(categoryPath, scene.name, "index.js");
        try {
          await fs.access(indexPath);
          const entry = { path: indexPath, ratio: ratio.name };
          const bucket = index.get(scene.name) || [];
          bucket.push(entry);
          index.set(scene.name, bucket);
        } catch {}
      }
    }
  }
  return index;
}

function stripEsm(source: any) {
  return source
    .replace(/^\s*import\s+.+?;\s*$/gm, "")
    .replace(/^\s*export\s+/gm, "");
}

function prepareDesignPreamble(source: any) {
  return stripEsm(source)
    .replace(
      /function scaleW\s*\([^)]*\)\s*\{[\s\S]*?\n\}/,
      'function scaleW(vp, px, baseW) {\n  return Math.round((vp.width * px) / (baseW || 1080));\n}',
    )
    .replace(
      /function scaleH\s*\([^)]*\)\s*\{[\s\S]*?\n\}/,
      'function scaleH(vp, px, baseH) {\n  return Math.round((vp.height * px) / (baseH || 1920));\n}',
    );
}

function resolveScenePath(index: any, sceneId: any, preferredRatio: any) {
  const matches = index.get(sceneId) || [];
  if (!matches.length) fail(`scene "${sceneId}" was not found`);
  if (preferredRatio) {
    const exact = matches.find((entry: any) => entry.ratio === preferredRatio);
    if (exact) return exact.path;
  }
  if (matches.length === 1) return matches[0].path;
  fail(`scene "${sceneId}" matched multiple ratios`);
}

async function main() {
  const [timelinePath, outputPath] = process.argv.slice(2);
  if (!timelinePath || !outputPath) {
    fail("usage is: node bundle-for-preview.js <timeline.json> <output.js>");
  }

  const timeline = JSON.parse(await fs.readFile(timelinePath, "utf8"));
  const sceneIds = extractSceneIds(timeline);
  const preferredRatio = normalizeRatio(timeline);
  const sceneIndex = await buildSceneIndex();
  const designSource = prepareDesignPreamble(await fs.readFile(DESIGN_PATH, "utf8"));
  const chunks = [
    "window.__scenes = window.__scenes || {};",
    designSource,
  ];

  for (const sceneId of sceneIds) {
    const scenePath = resolveScenePath(sceneIndex, sceneId, preferredRatio);
    const sceneSource = stripEsm(await fs.readFile(scenePath, "utf8"));
    chunks.push(
      `(function(){\n${sceneSource}\nwindow.__scenes[${JSON.stringify(sceneId)}] = { render, meta: typeof meta !== "undefined" ? meta : null };\n})();`,
    );
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${chunks.join("\n\n")}\n`, "utf8");
}

main().catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`);
  process.exit(1);
});
