const SAMPLE_SIZE = 120;
const TARGET_FRAME_MS = 1000 / 60;

export function createPerfMonitor() {
  const samples = new Float32Array(SAMPLE_SIZE);
  const sortedSamples = new Float32Array(SAMPLE_SIZE);
  const droppedFlags = new Uint8Array(SAMPLE_SIZE);

  let size = 0;
  let cursor = 0;
  let totalMs = 0;
  let drops = 0;

  return {
    tick(dt) {
      const dtMs = Number(dt);
      if (!Number.isFinite(dtMs) || dtMs <= 0) {
        return;
      }

      if (size === SAMPLE_SIZE) {
        totalMs -= samples[cursor];
        drops -= droppedFlags[cursor];
      } else {
        size += 1;
      }

      const didDrop = dtMs > TARGET_FRAME_MS ? 1 : 0;

      samples[cursor] = dtMs;
      droppedFlags[cursor] = didDrop;
      totalMs += dtMs;
      drops += didDrop;
      cursor = (cursor + 1) % SAMPLE_SIZE;
    },
    getStats() {
      if (size === 0 || totalMs <= 0) {
        return {
          fps: 0,
          p50Ms: 0,
          p95Ms: 0,
          p99Ms: 0,
          drops: 0,
        };
      }

      for (let index = 0; index < size; index += 1) {
        sortedSamples[index] = samples[index];
      }

      sortAscending(sortedSamples, size);

      return {
        fps: 1000 / (totalMs / size),
        p50Ms: readPercentile(sortedSamples, size, 0.5),
        p95Ms: readPercentile(sortedSamples, size, 0.95),
        p99Ms: readPercentile(sortedSamples, size, 0.99),
        drops,
      };
    },
    reset() {
      size = 0;
      cursor = 0;
      totalMs = 0;
      drops = 0;
    },
  };
}

function readPercentile(values, size, percentile) {
  const index = Math.max(0, Math.ceil(size * percentile) - 1);
  return values[Math.min(index, size - 1)];
}

function sortAscending(values, size) {
  for (let index = 1; index < size; index += 1) {
    const value = values[index];
    let insertAt = index - 1;

    while (insertAt >= 0 && values[insertAt] > value) {
      values[insertAt + 1] = values[insertAt];
      insertAt -= 1;
    }

    values[insertAt + 1] = value;
  }
}
