import { writeFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';

const width = 1920;
const height = 1080;
const outputPath = new URL('./frame_t5.png', import.meta.url);
const tArg = process.argv[2];
const t = Number.parseFloat(tArg ?? '5.0');

if (!Number.isFinite(t)) {
  console.error(`Invalid time value: ${tArg ?? '(missing)'}`);
  process.exit(1);
}

const moduleUrl = new URL('./auroraGradient.js', import.meta.url);
const { auroraGradient } = await import(moduleUrl.href);

const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

const startedAt = performance.now();
auroraGradient(
  t,
  { hueA: 270, hueB: 200, hueC: 320, intensity: 1, grain: 0.04 },
  ctx
);
const pngBuffer = canvas.toBuffer('image/png');
const finishedAt = performance.now();

await writeFile(outputPath, pngBuffer);

console.log(
  JSON.stringify(
    {
      output: outputPath.pathname,
      t,
      width,
      height,
      renderMs: Number((finishedAt - startedAt).toFixed(3)),
    },
    null,
    2
  )
);
