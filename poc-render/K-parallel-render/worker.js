import { mkdir, writeFile } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import {
  BENCHMARK_OUTPUT_DIR,
  SINGLE_FRAME_PARAMS,
  frameFileName,
  frameIndexToTime,
  renderFrameToBuffer,
} from './render.js';

async function run() {
  const { start, end } = workerData;
  await mkdir(BENCHMARK_OUTPUT_DIR, { recursive: true });

  for (let frameIndex = start; frameIndex < end; frameIndex += 1) {
    const pngBuffer = renderFrameToBuffer(
      frameIndexToTime(frameIndex),
      SINGLE_FRAME_PARAMS
    );
    await writeFile(`${BENCHMARK_OUTPUT_DIR}/${frameFileName(frameIndex)}`, pngBuffer);
  }

  parentPort?.postMessage({ start, end, framesRendered: end - start });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
