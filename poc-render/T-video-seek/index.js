import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { VideoFrameHelper } from './videoFrame.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 1920;
const HEIGHT = 1080;
const SAMPLE_VIDEO = '/Users/Zhuanz/bigbang/NextFrame/poc-render/H-frames-to-mp4/out.mp4';
const REPORT_PATH = path.join(__dirname, 'report.md');

function hashBuffer(buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatMs(value) {
  return `${value.toFixed(3)} ms`;
}

function frameToCanvas(frame) {
  const offscreenCanvas = createCanvas(frame.width, frame.height);
  const offscreenCtx = offscreenCanvas.getContext('2d');
  const imageData = new ImageData(
    new Uint8ClampedArray(
      frame.pixels.buffer,
      frame.pixels.byteOffset,
      frame.pixels.byteLength
    ),
    frame.width,
    frame.height
  );

  offscreenCtx.putImageData(imageData, 0, 0);
  return offscreenCanvas;
}

function drawWithFit(ctx, frame, fit = 'contain') {
  const sourceCanvas = frameToCanvas(frame);
  const scale =
    fit === 'cover'
      ? Math.max(WIDTH / frame.width, HEIGHT / frame.height)
      : Math.min(WIDTH / frame.width, HEIGHT / frame.height);
  const drawWidth = frame.width * scale;
  const drawHeight = frame.height * scale;
  const dx = (WIDTH - drawWidth) / 2;
  const dy = (HEIGHT - drawHeight) / 2;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(sourceCanvas, dx, dy, drawWidth, drawHeight);
}

function resolveClipTiming(t, params, metadata) {
  const clipStart = params.clipStart ?? 0;
  const speed = params.speed ?? 1;
  const srcStart = params.srcStart ?? 0;
  const durationLimit = Number.isFinite(metadata.durationSec) ? metadata.durationSec : srcStart;
  const defaultSrcEnd = speed < 0 ? 0 : durationLimit;
  const rawSrcEnd = params.srcEnd ?? defaultSrcEnd;
  const srcEnd = clamp(rawSrcEnd, 0, durationLimit);
  const rawSrcTime = srcStart + (t - clipStart) * speed;

  let sourceTimeSec = rawSrcTime;
  let frozen = false;

  if (speed >= 0 && rawSrcTime > srcEnd) {
    sourceTimeSec = srcEnd;
    frozen = true;
  }

  if (speed < 0 && rawSrcTime < srcEnd) {
    sourceTimeSec = srcEnd;
    frozen = true;
  }

  sourceTimeSec = clamp(sourceTimeSec, 0, durationLimit);

  return {
    clipStart,
    speed,
    srcStart,
    srcEnd,
    rawSrcTime,
    sourceTimeSec,
    frozen,
  };
}

async function videoClipScene(t, params, ctx, videoFrameHelper) {
  const metadata = videoFrameHelper.getMetadata(params.src);
  const timing = resolveClipTiming(t, params, metadata);
  const frame = await videoFrameHelper.extractFrameAt(params.src, timing.sourceTimeSec);

  drawWithFit(ctx, frame, params.fit ?? 'contain');

  return {
    ...timing,
    extractedTimeSec: frame.timeSec,
    extractMs: frame.extractMs,
    fromCache: frame.fromCache,
    frameHash: hashBuffer(frame.pixels),
  };
}

async function renderSceneFrame(t, sceneParams, videoFrameHelper, outputPath) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const startedAt = performance.now();
  const sceneResult = await videoClipScene(t, sceneParams, ctx, videoFrameHelper);
  const pixelBuffer = canvas.data();
  const pixelHash = hashBuffer(pixelBuffer);
  const pngBuffer = canvas.toBuffer('image/png');
  const pngHash = hashBuffer(pngBuffer);
  const renderMs = Number((performance.now() - startedAt).toFixed(3));

  if (outputPath) {
    await writeFile(outputPath, pngBuffer);
  }

  return {
    t,
    outputPath,
    pixelHash,
    pngHash,
    renderMs,
    ...sceneResult,
  };
}

function buildReport({ metadata, cases, totalMs, helper }) {
  const initialExtracts = cases.map((testCase) => testCase.first.extractMs);
  const averageExtractMs =
    initialExtracts.reduce((sum, value) => sum + value, 0) / initialExtracts.length;

  const caseLines = cases
    .map((testCase) => {
      const first = testCase.first;
      const repeat = testCase.repeat;
      return [
        `### ${testCase.fileName}`,
        ``,
        `- Params: \`t=${testCase.t.toFixed(1)}\`, \`srcStart=${testCase.params.srcStart.toFixed(1)}\`, \`srcEnd=${testCase.params.srcEnd.toFixed(1)}\`, \`speed=${testCase.params.speed.toFixed(1)}\`, \`fit=${testCase.params.fit}\``,
        `- Expected source time: \`${testCase.expectedSourceTime.toFixed(3)} s\``,
        `- Resolved raw source time: \`${first.rawSrcTime.toFixed(3)} s\``,
        `- Extracted source time: \`${first.extractedTimeSec.toFixed(3)} s\``,
        `- Initial extract latency: \`${formatMs(first.extractMs)}\``,
        `- Initial render time: \`${formatMs(first.renderMs)}\``,
        `- Repeat render time: \`${formatMs(repeat.renderMs)}\``,
        `- Repeat render hit cache: \`${repeat.fromCache}\``,
        `- Pixel hash stable across repeated render: \`${first.pixelHash === repeat.pixelHash}\``,
      ].join('\n');
    })
    .join('\n\n');

  return `# T-video-seek Report

## Input

- Source video: \`${SAMPLE_VIDEO}\`
- Source resolution: \`${metadata.width}x${metadata.height}\`
- Source duration: \`${metadata.durationSec.toFixed(3)} s\`
- Source fps: \`${metadata.fps?.toFixed(3) ?? 'n/a'}\`
- Scene model: \`videoClipScene(t, params:{src, srcStart, srcEnd, speed, fit}, ctx)\`

## Per-Frame Results

${caseLines}

## Performance

- Total script wall time: \`${formatMs(totalMs)}\`
- Uncached extract latencies: \`${initialExtracts.map(formatMs).join(', ')}\`
- Average uncached extract latency: \`${formatMs(averageExtractMs)}\`
- Cache requests / hits / misses: \`${helper.stats.requests} / ${helper.stats.hits} / ${helper.stats.misses}\`
- Cache hit rate: \`${(helper.getCacheHitRate() * 100).toFixed(1)}%\`

## Frame-Pure Verdict

- Preserved: \`${cases.every((testCase) => testCase.first.pixelHash === testCase.repeat.pixelHash)}\`
- Evidence: every repeated render of the same \`(t, params)\` produced the same pixel hash, and each repeat hit the \`(src,time)\` frame cache instead of launching ffmpeg again.

## Negative Speed Gotchas

- Reverse playback needs \`srcEnd\` treated as the lower bound. If negative-speed clips defaulted \`srcEnd\` to video duration, they would freeze immediately because \`srcTime < srcEnd\` on the first step.
- \`srcStart=5.0\` is conceptually valid for this source, but ffmpeg frame extraction still clamps terminal seeks slightly below duration to avoid empty output on exact end timestamps.
- The freeze rule becomes directional: forward clips freeze when \`srcTime > srcEnd\`, reverse clips freeze when \`srcTime < srcEnd\`.
`;
}

async function main() {
  const startedAt = performance.now();
  const helper = new VideoFrameHelper();
  const metadata = helper.getMetadata(SAMPLE_VIDEO);
  const defaultForwardEnd = Number.isFinite(metadata.durationSec) ? metadata.durationSec : 0;
  const cases = [
    {
      fileName: 'frame_normal.png',
      t: 2.0,
      expectedSourceTime: 2.0,
      params: {
        src: SAMPLE_VIDEO,
        clipStart: 0,
        srcStart: 0.0,
        srcEnd: defaultForwardEnd,
        speed: 1.0,
        fit: 'cover',
      },
    },
    {
      fileName: 'frame_2x.png',
      t: 2.0,
      expectedSourceTime: 4.0,
      params: {
        src: SAMPLE_VIDEO,
        clipStart: 0,
        srcStart: 0.0,
        srcEnd: defaultForwardEnd,
        speed: 2.0,
        fit: 'cover',
      },
    },
    {
      fileName: 'frame_half.png',
      t: 2.0,
      expectedSourceTime: 1.0,
      params: {
        src: SAMPLE_VIDEO,
        clipStart: 0,
        srcStart: 0.0,
        srcEnd: defaultForwardEnd,
        speed: 0.5,
        fit: 'cover',
      },
    },
    {
      fileName: 'frame_reverse.png',
      t: 2.0,
      expectedSourceTime: 3.0,
      params: {
        src: SAMPLE_VIDEO,
        clipStart: 0,
        srcStart: 5.0,
        srcEnd: 0.0,
        speed: -1.0,
        fit: 'cover',
      },
    },
  ];

  for (const testCase of cases) {
    testCase.outputPath = path.join(__dirname, testCase.fileName);
    testCase.first = await renderSceneFrame(
      testCase.t,
      testCase.params,
      helper,
      testCase.outputPath
    );
    testCase.repeat = await renderSceneFrame(testCase.t, testCase.params, helper);
  }

  const totalMs = Number((performance.now() - startedAt).toFixed(3));
  const report = buildReport({
    metadata,
    cases,
    totalMs,
    helper,
  });

  await writeFile(REPORT_PATH, report);

  console.log(
    JSON.stringify(
      {
        source: SAMPLE_VIDEO,
        outputs: cases.map((testCase) => ({
          file: testCase.outputPath,
          t: testCase.t,
          expectedSourceTime: testCase.expectedSourceTime,
          actualSourceTime: testCase.first.extractedTimeSec,
          extractMs: testCase.first.extractMs,
          renderMs: testCase.first.renderMs,
          repeatRenderMs: testCase.repeat.renderMs,
          pixelHashStable: testCase.first.pixelHash === testCase.repeat.pixelHash,
          repeatFromCache: testCase.repeat.fromCache,
        })),
        cache: {
          requests: helper.stats.requests,
          hits: helper.stats.hits,
          misses: helper.stats.misses,
          hitRate: Number((helper.getCacheHitRate() * 100).toFixed(1)),
        },
        report: REPORT_PATH,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
