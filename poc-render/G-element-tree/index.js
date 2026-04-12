import { writeFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import {
  HEIGHT,
  WIDTH,
  hitTestScene,
  identityMatrix,
  renderScene,
} from './sceneModel.js';
import { buildSampleScene } from './sampleScene.js';

const outputPath = new URL('./frame_t5.png', import.meta.url);
const tArg = process.argv[2];
const t = Number.parseFloat(tArg ?? '5.0');

if (!Number.isFinite(t)) {
  console.error(`Invalid time value: ${tArg ?? '(missing)'}`);
  process.exit(1);
}

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
const measureCanvas = createCanvas(1, 1);
const measureCtx = measureCanvas.getContext('2d');
const viewportTransform = identityMatrix();
const sceneTree = buildSampleScene();

const startedAt = performance.now();
renderScene(ctx, sceneTree, viewportTransform);
const pngBuffer = canvas.toBuffer('image/png');
const finishedAt = performance.now();

await writeFile(outputPath, pngBuffer);

const sampleHits = [
  { x: 1500, y: 480 },
  { x: 1220, y: 650 },
  { x: 290, y: 200 },
  { x: 40, y: 40 },
].map(({ x, y }) => ({
  x,
  y,
  hit: hitTestScene(sceneTree, x, y, viewportTransform, measureCtx),
}));

console.log(
  JSON.stringify(
    {
      output: outputPath.pathname,
      t,
      width: WIDTH,
      height: HEIGHT,
      renderMs: Number((finishedAt - startedAt).toFixed(3)),
      sampleHits,
    },
    null,
    2
  )
);
