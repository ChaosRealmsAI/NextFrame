import { stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { auroraGradient } from '../auroraGradient.js';

const width = 1920;
const height = 1080;
const fps = 30;
const totalFrames = 150;
const params = {
  hueA: 270,
  hueB: 200,
  hueC: 320,
  intensity: 1,
  grain: 0.04,
};
const outputPath = fileURLToPath(new URL('./out.mp4', import.meta.url));
const reportPath = fileURLToPath(new URL('./report.md', import.meta.url));

function formatMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function formatFps(rate) {
  const [numText, denText] = String(rate ?? '').split('/');
  const num = Number(numText);
  const den = Number(denText);

  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return 'unknown';
  }

  return (num / den).toFixed(2);
}

async function writeFrame(stream, frame) {
  if (stream.write(frame)) {
    return;
  }

  await once(stream, 'drain');
}

async function renderVideo() {
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${width}x${height}`,
      '-r',
      String(fps),
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '18',
      'out.mp4',
    ],
    {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      stdio: ['pipe', 'ignore', 'pipe'],
    }
  );

  let ffmpegStderr = '';
  ffmpeg.stderr.setEncoding('utf8');
  ffmpeg.stderr.on('data', (chunk) => {
    ffmpegStderr += chunk;
  });

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const frameHashes = new Set();
  let framesDiffer = false;
  let previousHash = null;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const t = frameIndex / fps;
    ctx.clearRect(0, 0, width, height);
    auroraGradient(t, params, ctx);

    const rgbaFrame = canvas.data();
    const frameHash = createHash('sha1').update(rgbaFrame).digest('hex');
    frameHashes.add(frameHash);

    if (previousHash !== null && previousHash !== frameHash) {
      framesDiffer = true;
    }
    previousHash = frameHash;

    await writeFrame(ffmpeg.stdin, rgbaFrame);
  }

  ffmpeg.stdin.end();
  const [exitCode] = await once(ffmpeg, 'close');

  if (exitCode !== 0) {
    throw new Error(`ffmpeg exited with code ${exitCode}\n${ffmpegStderr}`);
  }

  return {
    ffmpegStderr,
    frameHashes,
    framesDiffer,
  };
}

function probeVideo() {
  const ffprobe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height,avg_frame_rate,r_frame_rate,duration',
      '-of',
      'json',
      outputPath,
    ],
    {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
    }
  );

  if (ffprobe.status !== 0) {
    throw new Error(`ffprobe exited with code ${ffprobe.status}\n${ffprobe.stderr}`);
  }

  const parsed = JSON.parse(ffprobe.stdout);
  return parsed.streams?.[0] ?? null;
}

function buildReport({ totalMs, fileBytes, probe, frameHashes, framesDiffer }) {
  const durationSeconds = Number.parseFloat(probe?.duration ?? 'NaN');
  const animationVerdict = framesDiffer && frameHashes.size > 1 ? 'Yes' : 'No';

  return `# H-frames-to-mp4 Report

- Command run: \`npm install && node index.js\`
- Total time: \`${totalMs.toFixed(2)} ms\`
- Output size: \`${formatMegabytes(fileBytes)} MB\`
- Output file: \`out.mp4\`
- Animated output check: \`${animationVerdict}\`
- Unique frame hashes across 150 frames: \`${frameHashes.size}\`

## ffprobe

- Codec: \`${probe?.codec_name ?? 'unknown'}\`
- Resolution: \`${probe?.width ?? 'unknown'}x${probe?.height ?? 'unknown'}\`
- Duration: \`${Number.isFinite(durationSeconds) ? durationSeconds.toFixed(3) : 'unknown'} s\`
- Avg frame rate: \`${formatFps(probe?.avg_frame_rate)} fps\`
- Real frame rate: \`${formatFps(probe?.r_frame_rate)} fps\`

## Verdict

The exported MP4 ${animationVerdict === 'Yes' ? 'looks animated by frame-difference check' : 'does not appear animated by frame-difference check'}.
`;
}

const startedAt = performance.now();
const renderResult = await renderVideo();
const totalMs = performance.now() - startedAt;
const probe = probeVideo();
const fileInfo = await stat(outputPath);
const report = buildReport({
  totalMs,
  fileBytes: fileInfo.size,
  probe,
  frameHashes: renderResult.frameHashes,
  framesDiffer: renderResult.framesDiffer,
});

await writeFile(reportPath, report);

console.log(
  JSON.stringify(
    {
      output: outputPath,
      totalFrames,
      width,
      height,
      fps,
      totalMs: Number(totalMs.toFixed(3)),
      sizeMB: Number(formatMegabytes(fileInfo.size)),
      codec: probe?.codec_name ?? null,
      durationSeconds: probe?.duration ? Number.parseFloat(probe.duration) : null,
      avgFps: probe?.avg_frame_rate ? Number(formatFps(probe.avg_frame_rate)) : null,
      animated: renderResult.framesDiffer && renderResult.frameHashes.size > 1,
      uniqueFrameHashes: renderResult.frameHashes.size,
      report: reportPath,
    },
    null,
    2
  )
);
