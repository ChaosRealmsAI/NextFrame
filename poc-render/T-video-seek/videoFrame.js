import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

function parseRate(rateText) {
  const [numeratorText, denominatorText] = String(rateText ?? '').split('/');
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function collectStdout(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    stream.once('error', reject);
    stream.once('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

function collectStderr(stream) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      stderr += chunk;
    });
    stream.once('error', reject);
    stream.once('end', () => {
      resolve(stderr);
    });
  });
}

export class VideoFrameHelper {
  #frameCache = new Map();
  #metadataCache = new Map();

  constructor() {
    this.stats = {
      requests: 0,
      hits: 0,
      misses: 0,
      extractLatenciesMs: [],
      requestedTimes: [],
    };
  }

  getCacheHitRate() {
    if (this.stats.requests === 0) {
      return 0;
    }

    return this.stats.hits / this.stats.requests;
  }

  getMetadata(srcPath) {
    const resolvedPath = path.resolve(srcPath);

    if (this.#metadataCache.has(resolvedPath)) {
      return this.#metadataCache.get(resolvedPath);
    }

    const ffprobe = spawnSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,duration,avg_frame_rate',
        '-of',
        'json',
        resolvedPath,
      ],
      {
        encoding: 'utf8',
      }
    );

    if (ffprobe.status !== 0) {
      throw new Error(`ffprobe failed for ${resolvedPath}\n${ffprobe.stderr}`);
    }

    const stream = JSON.parse(ffprobe.stdout).streams?.[0];

    if (!stream?.width || !stream?.height) {
      throw new Error(`Unable to probe dimensions for ${resolvedPath}`);
    }

    const metadata = {
      srcPath: resolvedPath,
      width: Number(stream.width),
      height: Number(stream.height),
      durationSec: Number.parseFloat(stream.duration ?? 'NaN'),
      fps: parseRate(stream.avg_frame_rate),
    };

    this.#metadataCache.set(resolvedPath, metadata);
    return metadata;
  }

  async extractFrameAt(srcPath, timeSec) {
    const metadata = this.getMetadata(srcPath);
    const minimumFrameSpan = metadata.fps ? 1 / metadata.fps : 1 / 30;
    const maxSeekTime = Number.isFinite(metadata.durationSec)
      ? Math.max(0, metadata.durationSec - minimumFrameSpan / 2)
      : Number.POSITIVE_INFINITY;
    const clampedTimeSec = Math.min(Math.max(0, timeSec), maxSeekTime);
    const roundedTimeSec = Number(clampedTimeSec.toFixed(6));
    const cacheKey = `${metadata.srcPath}::${roundedTimeSec.toFixed(6)}`;

    this.stats.requests += 1;
    this.stats.requestedTimes.push(roundedTimeSec);

    if (this.#frameCache.has(cacheKey)) {
      this.stats.hits += 1;
      return {
        ...this.#frameCache.get(cacheKey),
        fromCache: true,
      };
    }

    this.stats.misses += 1;
    const startedAt = performance.now();
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-v',
        'error',
        '-ss',
        roundedTimeSec.toFixed(6),
        '-i',
        metadata.srcPath,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-',
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const [stdout, stderr, exitCode] = await Promise.all([
      collectStdout(ffmpeg.stdout),
      collectStderr(ffmpeg.stderr),
      new Promise((resolve, reject) => {
        ffmpeg.once('error', reject);
        ffmpeg.once('close', resolve);
      }),
    ]);

    if (exitCode !== 0) {
      throw new Error(`ffmpeg failed for ${metadata.srcPath} @ ${roundedTimeSec}s\n${stderr}`);
    }

    const expectedSize = metadata.width * metadata.height * 4;
    if (stdout.length !== expectedSize) {
      throw new Error(
        `Unexpected frame size for ${metadata.srcPath} @ ${roundedTimeSec}s: ` +
          `expected ${expectedSize} bytes, got ${stdout.length}`
      );
    }

    const extractMs = Number((performance.now() - startedAt).toFixed(3));
    this.stats.extractLatenciesMs.push(extractMs);

    const frame = {
      srcPath: metadata.srcPath,
      width: metadata.width,
      height: metadata.height,
      timeSec: roundedTimeSec,
      pixels: stdout,
      extractMs,
    };

    this.#frameCache.set(cacheKey, frame);
    return {
      ...frame,
      fromCache: false,
    };
  }
}
