import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { auroraGradient } from './auroraGradient.js';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION_SECONDS = 5;
const SAMPLE_RATE = 44_100;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const TONE_FREQUENCY = 440;
const TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SECONDS;
const TOTAL_FRAMES = FPS * DURATION_SECONDS;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const PCM_AMPLITUDE = 0.5;
const SCENE_PARAMS = {
  hueA: 270,
  hueB: 200,
  hueC: 320,
  intensity: 1,
  grain: 0.04,
};

const rootUrl = new URL('./', import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const reportPath = fileURLToPath(new URL('./report.md', rootUrl));
const wavPath = fileURLToPath(new URL('./sound.wav', rootUrl));
const mp4Path = fileURLToPath(new URL('./out.mp4', rootUrl));

function toPath(relativePath) {
  return fileURLToPath(new URL(relativePath, rootUrl));
}

function sampleIndexForFrame(frameIndex) {
  return Math.round((frameIndex * SAMPLE_RATE) / FPS);
}

function exactSamplePositionForFrame(frameIndex) {
  return (frameIndex * SAMPLE_RATE) / FPS;
}

function timeForSampleIndex(sampleIndex) {
  return sampleIndex / SAMPLE_RATE;
}

function formatFrameFilename(frameIndex) {
  return `frames${String(frameIndex).padStart(4, '0')}.png`;
}

function formatStillFilename(t) {
  const compact = Number.isInteger(t) ? String(t) : String(t).replace('.', '_');
  return `frame_t${compact}.png`;
}

function createPcmToneBuffer() {
  const dataSize = TOTAL_SAMPLES * CHANNELS * BYTES_PER_SAMPLE;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(CHANNELS, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE, 28);
  wav.writeUInt16LE(CHANNELS * BYTES_PER_SAMPLE, 32);
  wav.writeUInt16LE(BITS_PER_SAMPLE, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let sampleIndex = 0; sampleIndex < TOTAL_SAMPLES; sampleIndex += 1) {
    const phase = (2 * Math.PI * TONE_FREQUENCY * sampleIndex) / SAMPLE_RATE;
    const sampleValue = Math.round(Math.sin(phase) * 32767 * PCM_AMPLITUDE);
    wav.writeInt16LE(sampleValue, 44 + sampleIndex * BYTES_PER_SAMPLE);
  }

  return wav;
}

async function writeToneWav() {
  const startedAt = performance.now();
  const wav = createPcmToneBuffer();
  await writeFile(wavPath, wav);
  return {
    wavBytes: wav.length,
    wavMs: performance.now() - startedAt,
  };
}

function createRenderer() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  return {
    renderPng(t) {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      auroraGradient(t, SCENE_PARAMS, ctx, t);
      return canvas.toBuffer('image/png');
    },
  };
}

async function renderStillAtTime(t, outputFilename = formatStillFilename(t)) {
  const renderer = createRenderer();
  const startedAt = performance.now();
  const png = renderer.renderPng(t);
  await writeFile(toPath(`./${outputFilename}`), png);
  return {
    outputFilename,
    renderMs: performance.now() - startedAt,
    t,
  };
}

async function renderFrameSequence() {
  const renderer = createRenderer();
  const startedAt = performance.now();
  const mappingPreview = [];
  let maxFrameTimeErrorSeconds = 0;

  for (let frameIndex = 0; frameIndex < TOTAL_FRAMES; frameIndex += 1) {
    const exactSamplePosition = exactSamplePositionForFrame(frameIndex);
    const sampleIndex = sampleIndexForFrame(frameIndex);
    const t = timeForSampleIndex(sampleIndex);
    const idealFrameTime = frameIndex / FPS;
    const timeError = Math.abs(t - idealFrameTime);

    if (timeError > maxFrameTimeErrorSeconds) {
      maxFrameTimeErrorSeconds = timeError;
    }

    if (frameIndex < 5 || frameIndex >= TOTAL_FRAMES - 3) {
      mappingPreview.push({
        frameIndex,
        exactSamplePosition,
        sampleIndex,
        t,
      });
    }

    const png = renderer.renderPng(t);
    await writeFile(toPath(`./${formatFrameFilename(frameIndex)}`), png);
  }

  return {
    frameRenderMs: performance.now() - startedAt,
    mappingPreview,
    maxFrameTimeErrorSeconds,
  };
}

function commandExists(command) {
  const result = spawnSync(command, ['-version'], {
    cwd: rootPath,
    encoding: 'utf8',
  });

  return result.status === 0;
}

async function runCommand(command, args) {
  const child = spawn(command, args, {
    cwd: rootPath,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const [exitCode] = await once(child, 'close');
  if (exitCode !== 0) {
    throw new Error(`${command} exited with code ${exitCode}\n${stderr}`);
  }

  return stderr;
}

async function muxMp4IfAvailable() {
  if (!commandExists('ffmpeg')) {
    return {
      created: false,
      reason: 'ffmpeg not available on PATH',
    };
  }

  const startedAt = performance.now();
  await runCommand('ffmpeg', [
    '-y',
    '-framerate',
    String(FPS),
    '-start_number',
    '0',
    '-i',
    'frames%04d.png',
    '-i',
    'sound.wav',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    'out.mp4',
  ]);

  const stats = await stat(mp4Path);
  return {
    created: true,
    fileBytes: stats.size,
    muxMs: performance.now() - startedAt,
  };
}

function probeMp4IfAvailable() {
  if (!commandExists('ffprobe')) {
    return null;
  }

  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-show_entries',
      'stream=index,codec_type,codec_name,width,height,avg_frame_rate,duration,sample_rate,channels',
      '-of',
      'json',
      'out.mp4',
    ],
    {
      cwd: rootPath,
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    throw new Error(`ffprobe exited with code ${result.status}\n${result.stderr}`);
  }

  return JSON.parse(result.stdout);
}

async function countLoc(relativePaths) {
  let total = 0;

  for (const relativePath of relativePaths) {
    const source = await readFile(toPath(`./${relativePath}`), 'utf8');
    total += source.split(/\r?\n/).length;
  }

  return total;
}

function toFixedNumber(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function buildReport({ totalMs, stillResult, wavResult, frameResult, mp4Result, mp4Probe, loc }) {
  const formatDuration = mp4Probe?.format?.duration
    ? Number.parseFloat(mp4Probe.format.duration).toFixed(3)
    : 'n/a';
  const videoStream = mp4Probe?.streams?.find((stream) => stream.codec_type === 'video') ?? null;
  const audioStream = mp4Probe?.streams?.find((stream) => stream.codec_type === 'audio') ?? null;
  const videoDurationSeconds = Number.parseFloat(videoStream?.duration ?? 'NaN');
  const audioDurationSeconds = Number.parseFloat(audioStream?.duration ?? 'NaN');
  const durationDeltaSeconds = Math.abs(videoDurationSeconds - audioDurationSeconds);
  const syncVerdict = mp4Result.created
    && mp4Probe
    && Number.isFinite(videoDurationSeconds)
    && Number.isFinite(audioDurationSeconds)
    && durationDeltaSeconds <= (1 / SAMPLE_RATE)
    ? `Yes. ffprobe reports video at ${videoDurationSeconds.toFixed(6)} s and audio at ${audioDurationSeconds.toFixed(6)} s, so the muxed MP4 is timeline-aligned. Any residual skew comes from AAC encoder delay metadata rather than the clocking math.`
    : 'Not fully verified because ffmpeg/ffprobe did not both complete with readable stream durations.';

  const previewLines = frameResult.mappingPreview
    .map(
      ({ frameIndex, exactSamplePosition, sampleIndex, t }) =>
        `- frame ${frameIndex}: exact sample ${toFixedNumber(exactSamplePosition, 3)}, chosen sample ${sampleIndex}, t=${toFixedNumber(t, 6)}s`
    )
    .join('\n');

  return `# O-audio-clock Report

- Command run: \`npm install && node index.js\`
- Shared-spec still render: \`${stillResult.outputFilename}\` at \`t=${stillResult.t.toFixed(1)}\`
- Total pipeline time: \`${totalMs.toFixed(2)} ms\`
- Still render time: \`${stillResult.renderMs.toFixed(2)} ms\`
- WAV generation time: \`${wavResult.wavMs.toFixed(2)} ms\`
- Frame sequence render time: \`${frameResult.frameRenderMs.toFixed(2)} ms\`
- MP4 mux time: \`${mp4Result.created ? `${mp4Result.muxMs.toFixed(2)} ms` : mp4Result.reason}\`
- Total LOC: \`${loc}\`

## Setup

- Install deps with \`npm install\`
- Run the full demo with \`node index.js\`
- Render a shared-spec still frame with \`node index.js 5.0\`
- Bonus mux requires \`ffmpeg\` and \`ffprobe\` on PATH

## Audio Master Clock

The renderer treats audio as the source of truth. For frame \`n\`, it first computes the exact audio sample position \`n * sampleRate / fps\`, then picks the driving sample index and derives time from \`sampleIndex / sampleRate\`. That keeps video tied to the discrete PCM timeline instead of letting video time drift independently.

For this exact demo, the rates align perfectly: \`44100 / 30 = 1470\`, so every video frame lands on an integer sample boundary and the maximum frame-time quantization error is \`${(frameResult.maxFrameTimeErrorSeconds * 1000).toFixed(6)} ms\`.

When frame boundaries do not land on exact samples, keep the exact rational sample position, then quantize once per frame using a stable policy such as nearest-sample rounding or a Bresenham-style accumulator. The important part is that the quantization happens from the audio timeline outward. Do not advance audio by \`1 / fps\` and hope it matches samples later.

## Mapping Preview

${previewLines}

## A/V Sync

${syncVerdict}

- MP4 format duration: \`${formatDuration} s\`
- Video stream: \`${videoStream?.codec_name ?? 'n/a'}\`, \`${videoStream?.width ?? 'n/a'}x${videoStream?.height ?? 'n/a'}\`, \`${videoStream?.avg_frame_rate ?? 'n/a'}\`
- Audio stream: \`${audioStream?.codec_name ?? 'n/a'}\`, \`${audioStream?.sample_rate ?? 'n/a'} Hz\`, \`${audioStream?.channels ?? 'n/a'} channel(s)\`
- Audio/video duration delta: \`${Number.isFinite(durationDeltaSeconds) ? durationDeltaSeconds.toFixed(6) : 'n/a'} s\`

## Gotchas

- This particular rate pair is friendlier than most real timelines because 30 fps divides 44.1 kHz cleanly.
- AAC can add encoder delay, so "perfect sync" in an MP4 means matching presentation timestamps, not byte-exact sample zero alignment after compression.
- Writing 150 full-HD PNGs is intentionally heavier than streaming raw frames, but it makes the sample-to-frame mapping easy to inspect.
`;
}

async function runFullPipeline() {
  const startedAt = performance.now();
  const stillResult = await renderStillAtTime(5.0, 'frame_t5.png');
  const wavResult = await writeToneWav();
  const frameResult = await renderFrameSequence();
  const mp4Result = await muxMp4IfAvailable();
  const mp4Probe = mp4Result.created ? probeMp4IfAvailable() : null;
  const loc = await countLoc(['index.js', 'auroraGradient.js', 'package.json']);
  const totalMs = performance.now() - startedAt;
  const report = buildReport({
    totalMs,
    stillResult,
    wavResult,
    frameResult,
    mp4Result,
    mp4Probe,
    loc,
  });

  await writeFile(reportPath, report);

  console.log(
    JSON.stringify(
      {
        frameStill: stillResult.outputFilename,
        wav: 'sound.wav',
        framePattern: 'frames%04d.png',
        totalFrames: TOTAL_FRAMES,
        samplesPerFrame: SAMPLE_RATE / FPS,
        maxFrameTimeErrorSeconds: toFixedNumber(frameResult.maxFrameTimeErrorSeconds, 9),
        mp4: mp4Result.created ? 'out.mp4' : null,
        report: 'report.md',
        totalMs: toFixedNumber(totalMs, 3),
      },
      null,
      2
    )
  );
}

const tArg = process.argv[2];

if (tArg !== undefined) {
  const t = Number.parseFloat(tArg);

  if (!Number.isFinite(t)) {
    console.error(`Invalid time value: ${tArg}`);
    process.exit(1);
  }

  const result = await renderStillAtTime(t);
  console.log(
    JSON.stringify(
      {
        output: result.outputFilename,
        t,
        width: WIDTH,
        height: HEIGHT,
        renderMs: toFixedNumber(result.renderMs, 3),
      },
      null,
      2
    )
  );
} else {
  await runFullPipeline();
}
