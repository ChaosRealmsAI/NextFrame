import { writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const DEFAULT_T = 5.0;
const SCENE_PARAMS = {
  hueA: 270,
  hueB: 200,
  hueC: 320,
  intensity: 1,
  grain: 0.04,
};
const OUTPUTS = [
  { name: 'frame_4k.png', width: 3840, height: 2160, label: '4K landscape' },
  { name: 'frame_1080.png', width: 1920, height: 1080, label: '1080p landscape' },
  { name: 'frame_vertical.png', width: 1080, height: 1920, label: '9:16 vertical' },
  { name: 'frame_square.png', width: 1080, height: 1080, label: '1:1 square' },
  { name: 'frame_small.png', width: 720, height: 720, label: 'small square' },
];

function parseTimeArg(rawArg) {
  const t = Number.parseFloat(rawArg ?? String(DEFAULT_T));
  if (!Number.isFinite(t)) {
    console.error(`Invalid time value: ${rawArg ?? '(missing)'}`);
    process.exit(1);
  }
  return t;
}

async function verifyPngDimensions(pngBuffer) {
  const image = await loadImage(pngBuffer);
  return { width: image.width, height: image.height };
}

function renderAuroraFrame(auroraGradient, width, height, t, params) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const startedAt = performance.now();
  auroraGradient(t, params, ctx);
  const pngBuffer = canvas.toBuffer('image/png');
  const renderMs = Number((performance.now() - startedAt).toFixed(3));

  return { pngBuffer, renderMs };
}

const t = parseTimeArg(process.argv[2]);
const moduleUrl = new URL('../auroraGradient.js', import.meta.url);
const { auroraGradient } = await import(moduleUrl.href);

const frames = [];
for (const output of OUTPUTS) {
  const { pngBuffer, renderMs } = renderAuroraFrame(
    auroraGradient,
    output.width,
    output.height,
    t,
    SCENE_PARAMS
  );
  const outputUrl = new URL(`./${output.name}`, import.meta.url);
  await writeFile(outputUrl, pngBuffer);

  const verified = await verifyPngDimensions(pngBuffer);
  frames.push({
    file: output.name,
    label: output.label,
    expected: { width: output.width, height: output.height },
    actual: verified,
    renderMs,
  });
}

console.log(
  JSON.stringify(
    {
      t,
      params: SCENE_PARAMS,
      frames,
    },
    null,
    2
  )
);
