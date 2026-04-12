import { readFile, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { auroraGradient } from "./auroraGradient.js";
import { kineticHeadline } from "./kineticHeadline.js";
import { lowerThirdVelvet } from "./lowerThirdVelvet.js";

const sceneRegistry = {
  auroraGradient,
  kineticHeadline,
  lowerThirdVelvet,
};

const timelineUrl = new URL("./timeline.json", import.meta.url);
const tArg = process.argv[2];
const renderT = Number.parseFloat(tArg ?? "6.0");

if (!Number.isFinite(renderT)) {
  console.error(`Invalid time value: ${tArg ?? "(missing)"}`);
  process.exit(1);
}

const timeline = JSON.parse(await readFile(timelineUrl, "utf8"));
const width = timeline.canvas?.width ?? 1920;
const height = timeline.canvas?.height ?? 1080;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");

ctx.clearRect(0, 0, width, height);
ctx.fillStyle = "#05050c";
ctx.fillRect(0, 0, width, height);

const activeClips = [...(timeline.clips ?? [])]
  .filter((clip) => renderT >= clip.start && renderT < clip.start + clip.duration)
  .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));

const startedAt = performance.now();

for (const clip of activeClips) {
  const sceneFn = sceneRegistry[clip.sceneId];
  if (typeof sceneFn !== "function") {
    throw new Error(`Unknown sceneId: ${clip.sceneId}`);
  }

  const localT = renderT - clip.start;
  sceneFn(localT, clip.params ?? {}, ctx, renderT);
}

const pngBuffer = canvas.toBuffer("image/png");
const outputName = `frame_t${String(renderT).replace(".", "_")}.png`;
const outputUrl = new URL(`./${outputName}`, import.meta.url);
await writeFile(outputUrl, pngBuffer);

const image = await loadImage(pngBuffer);
const probeCanvas = createCanvas(width, height);
const probeCtx = probeCanvas.getContext("2d");
probeCtx.drawImage(image, 0, 0, width, height);
const { data } = probeCtx.getImageData(0, 0, width, height);

let sum = 0;
let sumSquares = 0;
let alphaPixels = 0;
const sampleStride = 32;

for (let y = 0; y < height; y += sampleStride) {
  for (let x = 0; x < width; x += sampleStride) {
    const offset = (y * width + x) * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luminance;
    sumSquares += luminance * luminance;
    if (a > 0) {
      alphaPixels += 1;
    }
  }
}

const sampleCount = Math.ceil(height / sampleStride) * Math.ceil(width / sampleStride);
const mean = sum / sampleCount;
const variance = Math.max(0, sumSquares / sampleCount - mean * mean);
const finishedAt = performance.now();

console.log(
  JSON.stringify(
    {
      output: outputUrl.pathname,
      t: renderT,
      width,
      height,
      activeClipIds: activeClips.map((clip) => clip.id),
      renderMs: Number((finishedAt - startedAt).toFixed(3)),
      verification: {
        sampledPixels: sampleCount,
        nonTransparentSamples: alphaPixels,
        luminanceMean: Number(mean.toFixed(3)),
        luminanceVariance: Number(variance.toFixed(3))
      }
    },
    null,
    2
  )
);
