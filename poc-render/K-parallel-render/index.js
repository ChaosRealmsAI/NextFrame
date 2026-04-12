import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  BENCHMARK_OUTPUT_DIR,
  DURATION_SECONDS,
  FPS,
  HEIGHT,
  SINGLE_FRAME_PARAMS,
  TOTAL_FRAMES,
  WIDTH,
  frameFileName,
  frameIndexToTime,
  renderFrameToBuffer,
} from './render.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SINGLE_FRAME_OUTPUT = path.join(__dirname, 'frame_t5.png');
const REPORT_OUTPUT = path.join(__dirname, 'report.md');
const WORKER_COUNT = 8;

async function renderSingleFrame(t) {
  const startedAt = performance.now();
  const pngBuffer = renderFrameToBuffer(t, SINGLE_FRAME_PARAMS);
  await writeFile(SINGLE_FRAME_OUTPUT, pngBuffer);
  const finishedAt = performance.now();

  return {
    output: SINGLE_FRAME_OUTPUT,
    t,
    width: WIDTH,
    height: HEIGHT,
    renderMs: Number((finishedAt - startedAt).toFixed(3)),
  };
}

async function resetBenchmarkDir() {
  await rm(BENCHMARK_OUTPUT_DIR, { recursive: true, force: true });
}

async function runSequentialBenchmark() {
  await resetBenchmarkDir();
  await mkdir(BENCHMARK_OUTPUT_DIR, { recursive: true });
  const startedAt = performance.now();

  for (let frameIndex = 0; frameIndex < TOTAL_FRAMES; frameIndex += 1) {
    const pngBuffer = renderFrameToBuffer(
      frameIndexToTime(frameIndex),
      SINGLE_FRAME_PARAMS
    );
    await writeFile(
      path.join(BENCHMARK_OUTPUT_DIR, frameFileName(frameIndex)),
      pngBuffer
    );
  }

  const finishedAt = performance.now();
  return Number((finishedAt - startedAt).toFixed(3));
}

function createWorker(start, end) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { start, end },
    });

    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code} for range [${start}, ${end})`));
      }
    });
  });
}

function buildRanges(totalFrames, workerCount) {
  const framesPerWorker = Math.ceil(totalFrames / workerCount);
  const ranges = [];

  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    const start = workerIndex * framesPerWorker;
    const end = Math.min(totalFrames, start + framesPerWorker);

    if (start < end) {
      ranges.push({ start, end });
    }
  }

  return ranges;
}

async function runParallelBenchmark(workerCount) {
  await resetBenchmarkDir();
  const startedAt = performance.now();
  const ranges = buildRanges(TOTAL_FRAMES, workerCount);
  await Promise.all(ranges.map(({ start, end }) => createWorker(start, end)));
  const finishedAt = performance.now();
  return Number((finishedAt - startedAt).toFixed(3));
}

async function countLoc() {
  const entries = await readdir(__dirname, { withFileTypes: true });
  let total = 0;

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === 'package-lock.json' || entry.name === 'frame_t5.png') {
      continue;
    }

    const filePath = path.join(__dirname, entry.name);
    const contents = await readFile(filePath, 'utf8');
    total += contents.split('\n').length;
  }

  return total;
}

async function writeReport({ singleFrame, sequentialMs, parallelMs, workerCount }) {
  const speedup = sequentialMs / parallelMs;
  const loc = await countLoc();
  const report = `# K-parallel-render Report

## Result

- Output file: \`frame_t5.png\`
- Single-frame render call: \`auroraGradient(5.0, { hueA: 270, hueB: 200, hueC: 320, intensity: 1, grain: 0.04 }, ctx)\`
- Benchmark frames: \`${BENCHMARK_OUTPUT_DIR}/frame_0000.png\` through \`${BENCHMARK_OUTPUT_DIR}/frame_0299.png\`
- Worker model: Node \`worker_threads\`

## Timing

- Single-frame render + PNG encode at \`t=5.0\`: \`${singleFrame.renderMs} ms\`
- Sequential 300-frame wall time: \`${sequentialMs} ms\`
- Parallel 300-frame wall time with ${workerCount} workers: \`${parallelMs} ms\`
- Speedup ratio: \`${speedup.toFixed(3)}x\`
- Theoretical max speedup with ${workerCount} workers: \`${workerCount}x\`

## LOC

- Total LOC in this POC dir: \`${loc}\`

## Setup

\`\`\`bash
npm install
node index.js
node index.js 5.0
\`\`\`

## Gotchas

- The prompt says "300 frames" and also "t = 0..10s @ 30fps". Those two statements conflict if interpreted inclusively, so this POC uses 300 frames at \`t = frame / 30\`, which covers \`0.0\` through \`9.9667\` seconds.
- Speedup will not approach ${workerCount}x in practice because each frame still pays PNG encoding and filesystem write costs, and each worker repeats native canvas setup.
- Running sequential first warms the OS file cache and native module state a bit, so these numbers are useful as a pragmatic comparison, not a perfectly isolated benchmark.
- \`worker_threads\` keeps the implementation simple because each worker can import the shared scene module directly and render frame-pure timestamps without any cross-worker state.
`;

  await writeFile(REPORT_OUTPUT, report);
}

async function main() {
  const tArg = process.argv[2];

  if (tArg !== undefined) {
    const t = Number.parseFloat(tArg);

    if (!Number.isFinite(t)) {
      console.error(`Invalid time value: ${tArg}`);
      process.exit(1);
    }

    const singleFrame = await renderSingleFrame(t);
    console.log(JSON.stringify(singleFrame, null, 2));
    return;
  }

  const workerCount = Math.min(WORKER_COUNT, TOTAL_FRAMES);
  const singleFrame = await renderSingleFrame(5.0);
  const sequentialMs = await runSequentialBenchmark();
  const parallelMs = await runParallelBenchmark(workerCount);
  await writeReport({ singleFrame, sequentialMs, parallelMs, workerCount });

  console.log(
    JSON.stringify(
      {
        frameOutput: SINGLE_FRAME_OUTPUT,
        benchmarkOutputDir: BENCHMARK_OUTPUT_DIR,
        totalFrames: TOTAL_FRAMES,
        fps: FPS,
        durationSeconds: DURATION_SECONDS,
        workerCount,
        sequentialMs,
        parallelMs,
        speedup: Number((sequentialMs / parallelMs).toFixed(3)),
        report: REPORT_OUTPUT,
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
