const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");

const { createCanvas } = require("canvas");

const WIDTH = 1920;
const HEIGHT = 1080;
const OUTPUT_NAME = "frame_t5.png";
const PARAMS = {
  hueA: 270,
  hueB: 200,
  hueC: 320,
  intensity: 1,
  grain: 0.04,
};

async function loadAuroraGradient(scenePath) {
  const sceneUrl = pathToFileURL(scenePath).href;

  try {
    return await import(sceneUrl);
  } catch (error) {
    const source = fs.readFileSync(scenePath, "utf8");
    const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

    try {
      return await import(dataUrl);
    } catch {
      throw error;
    }
  }
}

async function main() {
  const t = Number(process.argv[2]);

  if (!Number.isFinite(t)) {
    console.error("Usage: node index.js <t_seconds>");
    process.exitCode = 1;
    return;
  }

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const scenePath = path.resolve(__dirname, "../auroraGradient.js");
  const { auroraGradient } = await loadAuroraGradient(scenePath);

  const renderStart = performance.now();
  auroraGradient(t, PARAMS, ctx, t);
  const pngBuffer = canvas.toBuffer("image/png");
  const outputPath = path.join(__dirname, OUTPUT_NAME);
  fs.writeFileSync(outputPath, pngBuffer);
  const renderMs = performance.now() - renderStart;

  console.log(`Rendered ${OUTPUT_NAME} at t=${t} in ${renderMs.toFixed(2)} ms`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
