// Preview bundle builder — assembles only the timeline's referenced scenes into one JS bundle.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { Timeline } from "../types.js";
import { buildSharedPreamble, collectSceneModules, readDiscoveredScenes } from "./build-scenes.js";

function fail(message: string): never {
  throw new Error(`failed to bundle preview scenes: ${message}. Fix: verify the timeline JSON references scenes that exist under src/nf-core/scenes.`);
}

function buildSceneIIFE(scene: { id: string; code: string }) {
  return `(function(){
${scene.code}
window.__scenes[${JSON.stringify(scene.id)}] = {
  render: typeof render === "function" ? render : null,
  meta: typeof meta !== "undefined" ? meta : null,
  screenshots: typeof screenshots === "function" ? screenshots : null,
  lint: typeof lint === "function" ? lint : null,
};
})();`;
}

function detectRatioId(timeline: Timeline): string {
  if (typeof (timeline as { ratio?: unknown }).ratio === "string") {
    return String((timeline as { ratio?: unknown }).ratio);
  }
  const width = Number(timeline.width || timeline.project?.width || 0);
  const height = Number(timeline.height || timeline.project?.height || 0);
  return width >= height ? "16:9" : "9:16";
}

function collectModularSceneModules(timeline: Timeline) {
  const modularIds = new Set(readDiscoveredScenes(detectRatioId(timeline)).map((scene: { id: string }) => scene.id));
  const filteredTimeline: Timeline = {
    ...timeline,
    layers: (timeline.layers || []).filter((layer) => layer?.scene && modularIds.has(layer.scene)),
  };
  return collectSceneModules(filteredTimeline);
}

async function main() {
  const [timelinePath, outputPath] = process.argv.slice(2);
  if (!timelinePath || !outputPath) {
    fail("usage is: node bundle-for-preview.js <timeline.json> <output.js>");
  }

  const timeline = JSON.parse(await fs.readFile(timelinePath, "utf8")) as Timeline;
  const scenes = collectModularSceneModules(timeline);
  const preamble = String(buildSharedPreamble() || "").trim();
  const chunks = ["(() => {", "window.__scenes = window.__scenes || {};"];
  if (preamble && preamble !== "// no shared/design.js") chunks.push(preamble);

  for (const scene of scenes) {
    chunks.push(buildSceneIIFE(scene));
  }

  chunks.push("})();");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${chunks.join("\n\n")}\n`, "utf8");
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${detail}\n`);
  process.exit(1);
});
